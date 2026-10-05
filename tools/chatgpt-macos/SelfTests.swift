#if SELF_TEST
import Foundation
import Network
import CryptoKit

private struct TestFailure: Error {}
private func expect(_ condition: @autoclosure () -> Bool) throws { if !condition() { throw TestFailure() } }
private func mustFail(_ action: () throws -> Void) throws {
    do { try action() } catch { return }; throw TestFailure()
}
private final class HTTPFixture: @unchecked Sendable {
    private let queue = DispatchQueue(label: "counselorbot.test.fixture")
    private var listener: NWListener?
    private var clients: [NWConnection] = []
    private let payload: Data
    init(status: String, extra: String = "", body: String) {
        payload = Data("HTTP/1.1 \(status)\r\nContent-Type: application/json\r\nConnection: close\r\n\(extra)Content-Length: \(body.utf8.count)\r\n\r\n\(body)".utf8)
    }
    func start() async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            queue.async {
                do {
                    let parameters = NWParameters.tcp
                    parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: .any)
                    let listener = try NWListener(using: parameters); self.listener = listener
                    var started = false
                    listener.stateUpdateHandler = { state in
                        if case .ready = state, !started, let port = listener.port {
                            started = true; continuation.resume(returning: URL(string: "http://127.0.0.1:\(port.rawValue)/fixture")!)
                        } else if case .failed = state, !started { started = true; continuation.resume(throwing: TestFailure()) }
                    }
                    listener.newConnectionHandler = { client in
                        self.clients.append(client); client.start(queue: self.queue)
                        client.receive(minimumIncompleteLength: 1, maximumLength: 16384) { _, _, _, _ in
                            client.send(content: self.payload, completion: .contentProcessed { _ in client.cancel() })
                        }
                    }
                    listener.start(queue: self.queue)
                } catch { continuation.resume(throwing: TestFailure()) }
            }
        }
    }
    func close() { queue.sync { listener?.cancel(); clients.forEach { $0.cancel() }; clients.removeAll() } }
}
@MainActor private final class ProtocolFixture: JSONTransport {
    var paths: [String] = []
    var authorization: [String: String] = [:]
    let pairing = String(repeating: "p", count: 43)
    func request(_ url: URL, bearer: String?, json: [String: Any]?, form: [String: String]?) async throws -> [String: Any] {
        paths.append(url.path)
        switch url.path {
        case "/api/chatgpt/link/parameters":
            try expect(url.host == "fixture.invalid" && bearer == pairing && json == nil && form == nil)
            return ["client_id": "dynamic_agent_client", "nonce": "fixture-nonce", "host_id": "urn:uuid:fixture", "agent_name": "CounselorBot"]
        case "/api/chatgpt/link/registration":
            try expect(paths.count == 2 && bearer == pairing && json?["client_id"] as? String == "issued-fixture")
            return ["registered": true]
        case "/api/accounts/oauth/token":
            try expect(paths.count == 3 && url.absoluteString == oauthIssuer + "/api/accounts/oauth/token" && bearer == nil)
            try expect(form?["redirect_uri"] == authorization["redirect_uri"] && form?["code"] == "fixture-code" && form?["client_id"] == "issued-fixture")
            try expect(form?["grant_type"] == "authorization_code" && form?["resource"] == oauthResource)
            guard let verifier = form?["code_verifier"] else { throw TestFailure() }
            try expect(base64URL(Data(SHA256.hash(data: Data(verifier.utf8)))) == authorization["code_challenge"])
            return ["access_token": "fixture-access-never-displayed", "refresh_token": "fixture-refresh-never-displayed", "id_token": "fixture-id-never-displayed", "token_type": "Bearer", "scope": "fixture-scope", "earliest_refresh_at": 1234567890]
        case "/api/chatgpt/link/complete":
            try expect(paths.count == 4 && bearer == pairing && form == nil && json?["client_id"] as? String == "issued-fixture")
            try expect(json?["access_token"] as? String == "fixture-access-never-displayed" && json?["refresh_token"] as? String == "fixture-refresh-never-displayed")
            try expect(json?["id_token"] as? String == "fixture-id-never-displayed" && json?["scope"] as? String == "fixture-scope" && json?["username"] == nil)
            return ["connected": true]
        default: throw TestFailure()
        }
    }
    func cancel() {}
}
@MainActor func runSelfTests() async throws {
    for value in ["http://remote.invalid", "https://u:p@example.invalid", "https://example.invalid/path", "https://example.invalid?token=value", "file:///tmp/helper", "https://example.invalid/#bad", "https://example.invalid:0"] {
        try mustFail { _ = try serverOrigin(value) }
    }
    for value in ["https://counselorbot.labform.net", "http://127.0.0.1:3108", "http://localhost:3108/", "http://[::1]:3108"] { _ = try serverOrigin(value) }
    try expect(validPairing(String(repeating: "a", count: 43)) && !validPairing("too-short") && !validPairing(String(repeating: "a", count: 42) + "\n"))
    try expect(String(decoding: formBody(["a": "+ &é"]), as: UTF8.self) == "a=%2B%20%26%C3%A9")
    let state = "fixture-state", client = "issued-fixture"
    let invalid = ["/auth/callback?state=wrong&code=x", "/else?state=fixture-state&code=x", "/auth/callback?state=fixture-state&state=fixture-state&code=x", "//evil.invalid/auth/callback?state=fixture-state&code=x"]
    for target in invalid { guard case .invalid = validateCallback(target, state: state, client: client) else { throw TestFailure() } }
    let denied = ["/auth/callback?state=fixture-state&code=x&client_id=another", "/auth/callback?state=fixture-state&code=x&code=y", "/auth/callback?state=fixture-state&code=", "/auth/callback?state=fixture-state&error=cancel", "/auth/callback?state=fixture-state&code=x&client_id=dynamic_agent_client"]
    for target in denied { guard case .denied = validateCallback(target, state: state, client: client) else { throw TestFailure() } }
    guard case .grant = validateCallback("/auth/callback?state=fixture-state&code=x", state: state, client: client) else { throw TestFailure() }
    // Actual local listener: invalid callback must not consume the valid grant.
    let server = CallbackServer(state: state, client: "dynamic_agent_client")
    let redirect = try await server.start()
    try expect(redirect.host == "127.0.0.1" && redirect.path == "/auth/callback")
    let (_, rejected) = try await URLSession.shared.data(from: URL(string: redirect.absoluteString + "?state=wrong&code=x")!)
    try expect((rejected as? HTTPURLResponse)?.statusCode == 400)
    let (_, accepted) = try await URLSession.shared.data(from: URL(string: redirect.absoluteString + "?state=fixture-state&code=fixture-code&client_id=issued-fixture")!)
    try expect((accepted as? HTTPURLResponse)?.statusCode == 200 && (accepted as? HTTPURLResponse)?.value(forHTTPHeaderField: "Cache-Control") == "no-store")
    let grant = try await server.wait(); try expect(grant.clientID == client && grant.code == "fixture-code")
    // Cancellation resolves the outstanding waiter and closes the listening port.
    let cancelled = CallbackServer(state: state, client: client); _ = try await cancelled.start(); cancelled.cancel()
    do { _ = try await cancelled.wait(); throw TestFailure() } catch ConnectError.cancelled {} catch { throw TestFailure() }
    let expired = CallbackServer(state: state, client: client, lifetime: 0.05)
    _ = try await expired.start()
    do { _ = try await expired.wait(); throw TestFailure() } catch ConnectError.expired {} catch { throw TestFailure() }
    // Real URLSession tests: login redirect, oversize response and invalid JSON.
    for fixture in [HTTPFixture(status: "302 Found", extra: "Location: http://127.0.0.1:9/must-never-follow\r\n", body: "{}"), HTTPFixture(status: "200 OK", body: String(repeating: "x", count: 200001)), HTTPFixture(status: "200 OK", body: "[]")] {
        let url = try await fixture.start(); let http = HTTPClient()
        do { _ = try await http.request(url); throw TestFailure() } catch ConnectError.network {} catch { http.cancel(); fixture.close(); throw TestFailure() }
        http.cancel(); fixture.close()
    }
    let jsonFixture = HTTPFixture(status: "200 OK", body: "{\"ok\":true}")
    let jsonURL = try await jsonFixture.start(); let http = HTTPClient()
    let object = try await http.request(jsonURL)
    try expect(object["ok"] as? Bool == true)
    http.cancel(); jsonFixture.close()
    // End-to-end protocol with fake HTTP transport; OpenAI is never contacted.
    let fixture = ProtocolFixture()
    var browserTask: Task<Void, Error>?
    let connector = Connector(transport: fixture, openBrowser: { authorize in
        let parts = URLComponents(url: authorize, resolvingAgainstBaseURL: false)!
        guard parts.host == "auth.openai.com", parts.path == "/api/accounts/authorize" else { return false }
        fixture.authorization = Dictionary(uniqueKeysWithValues: (parts.queryItems ?? []).map { ($0.name, $0.value ?? "") })
        guard let redirect = fixture.authorization["redirect_uri"], let state = fixture.authorization["state"] else { return false }
        browserTask = Task {
            let (_, response) = try await URLSession.shared.data(from: URL(string: redirect + "?state=" + state + "&code=fixture-code&client_id=issued-fixture")!)
            try expect((response as? HTTPURLResponse)?.statusCode == 200)
        }
        return true
    })
    var stages: [ConnectStage] = []
    try await connector.connect(origin: URL(string: "https://fixture.invalid")!, pairing: fixture.pairing, progress: { stages.append($0) })
    try await browserTask?.value
    try expect(stages == [.parameters, .browser, .registration, .exchange, .complete])
    try expect(fixture.authorization["nonce"] == "fixture-nonce" && fixture.authorization["code_challenge_method"] == "S256" && fixture.authorization["agent_name_hint"] == "CounselorBot")
    try expect(fixture.authorization["state"]!.count == 43 && fixture.authorization["code_challenge"]!.count == 43)
}
#endif
