import Foundation
import CryptoKit
import Network
import Security

// Never include upstream error bodies, callback URLs, codes or OAuth credentials
// in errors. Only the GUI's fixed, Italian stage messages reach the user.
enum ConnectError: Error { case invalidOrigin, invalidPairing, network, response, callback, expired, cancelled, browser }
let oauthIssuer = "https://auth.openai.com"
let oauthResource = "https://api.openai.com/v1"
let oauthScopes = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct"

func serverOrigin(_ value: String) throws -> URL {
    guard let parts = URLComponents(string: value), let host = parts.host, !host.isEmpty,
          parts.user == nil, parts.password == nil, parts.query == nil, parts.fragment == nil,
          parts.path == "" || parts.path == "/",
          parts.scheme == "https" || (parts.scheme == "http" && ["localhost", "127.0.0.1", "::1", "[::1]"].contains(host)),
          parts.port == nil || (1...65535).contains(parts.port!),
          var url = parts.url else { throw ConnectError.invalidOrigin }
    if url.path == "/" { url.deleteLastPathComponent() }
    return url
}
func validPairing(_ value: String) -> Bool {
    value.range(of: "^[A-Za-z0-9_-]{30,100}\\z", options: .regularExpression) != nil
}
func base64URL(_ bytes: Data) -> String {
    bytes.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
}
func randomValue(_ count: Int) throws -> String {
    var bytes = [UInt8](repeating: 0, count: count)
    guard SecRandomCopyBytes(kSecRandomDefault, count, &bytes) == errSecSuccess else { throw ConnectError.response }
    return base64URL(Data(bytes))
}
func formBody(_ fields: [String: String]) -> Data {
    // RFC3986 percent encoding, including literal '+' (otherwise decoded as space).
    let allowed = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
    return Data(fields.sorted { $0.key < $1.key }.map {
        $0.key.addingPercentEncoding(withAllowedCharacters: allowed)! + "=" + $0.value.addingPercentEncoding(withAllowedCharacters: allowed)!
    }.joined(separator: "&").utf8)
}
protocol JSONTransport {
    @MainActor func request(_ url: URL, bearer: String?, json: [String: Any]?, form: [String: String]?) async throws -> [String: Any]
    @MainActor func cancel()
}
final class HTTPClient: NSObject, JSONTransport, URLSessionDataDelegate {
    private struct Pending { var bytes = Data(); var accepted = false; let continuation: CheckedContinuation<[String: Any], Error> }
    private let queue = OperationQueue()
    private var pending: [Int: Pending] = [:] // accessed exclusively on delegate queue
    private lazy var session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.httpCookieStorage = nil; config.httpShouldSetCookies = false
        config.urlCache = nil; config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.timeoutIntervalForRequest = 30; config.timeoutIntervalForResource = 45
        queue.maxConcurrentOperationCount = 1
        return URLSession(configuration: config, delegate: self, delegateQueue: queue)
    }()
    @MainActor func request(_ url: URL, bearer: String? = nil, json: [String: Any]? = nil, form: [String: String]? = nil) async throws -> [String: Any] {
        try Task.checkCancellation()
        var request = URLRequest(url: url)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15", forHTTPHeaderField: "User-Agent")
        if let bearer { request.setValue("Bearer " + bearer, forHTTPHeaderField: "Authorization") }
        if let json { request.httpMethod = "POST"; request.httpBody = try JSONSerialization.data(withJSONObject: json); request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        if let form { request.httpMethod = "POST"; request.httpBody = formBody(form); request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type") }
        let activeSession = session
        return try await withCheckedThrowingContinuation { continuation in
            let task = activeSession.dataTask(with: request)
            queue.addOperation { self.pending[task.taskIdentifier] = Pending(continuation: continuation); task.resume() }
        }
    }
    @MainActor func cancel() { session.invalidateAndCancel() }
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode), response.expectedContentLength <= 200_000 else { completionHandler(.cancel); return }
        pending[dataTask.taskIdentifier]?.accepted = true; completionHandler(.allow)
    }
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard let current = pending[dataTask.taskIdentifier], current.bytes.count + data.count <= 200_000 else { dataTask.cancel(); return }
        pending[dataTask.taskIdentifier]?.bytes.append(data)
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard let current = pending.removeValue(forKey: task.taskIdentifier) else { return }
        guard error == nil, current.accepted,
              let object = try? JSONSerialization.jsonObject(with: current.bytes) as? [String: Any] else {
            current.continuation.resume(throwing: ConnectError.network); return
        }
        current.continuation.resume(returning: object)
    }
}
struct Grant { let code: String; let clientID: String }
enum CallbackResult { case invalid, denied, grant(Grant) }
func validateCallback(_ target: String, state: String, client: String) -> CallbackResult {
    guard target.hasPrefix("/"), !target.hasPrefix("//"),
          let url = URLComponents(string: "http://127.0.0.1" + target), url.path == "/auth/callback", url.fragment == nil else { return .invalid }
    let items = url.queryItems ?? []
    func values(_ name: String) -> [String] { items.filter { $0.name == name }.map { $0.value ?? "" } }
    guard values("state") == [state] else { return .invalid }
    if !values("error").isEmpty { return .denied }
    let codes = values("code"), clients = values("client_id")
    guard codes.count == 1, !codes[0].isEmpty, codes[0].utf8.count <= 8192, clients.count <= 1 else { return .denied }
    let issued = clients.first ?? client
    guard !issued.isEmpty, issued.utf8.count <= 256, issued != "dynamic_agent_client",
          client == "dynamic_agent_client" || issued == client else { return .denied }
    return .grant(Grant(code: codes[0], clientID: issued))
}
// All mutable state and NW callbacks are confined to the private serial queue.
final class CallbackServer: @unchecked Sendable {
    private let queue = DispatchQueue(label: "net.labform.counselorbot.callback")
    private let state: String, client: String
    private let lifetime: TimeInterval
    private var listener: NWListener?
    private var connections: [ObjectIdentifier: NWConnection] = [:]
    private var result: Result<Grant, Error>?
    private var waiting: CheckedContinuation<Grant, Error>?
    private var starting: CheckedContinuation<URL, Error>?
    private var timeout: DispatchWorkItem?
    init(state: String, client: String, lifetime: TimeInterval = 600) { self.state = state; self.client = client; self.lifetime = lifetime }
    func start() async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            queue.async {
                do {
                    let parameters = NWParameters.tcp
                    parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: .any)
                    let listener = try NWListener(using: parameters)
                    self.listener = listener; self.starting = continuation
                    listener.stateUpdateHandler = { status in
                        switch status {
                        case .ready:
                            guard let port = listener.port, let start = self.starting else { return }
                            self.starting = nil
                            start.resume(returning: URL(string: "http://127.0.0.1:\(port.rawValue)/auth/callback")!)
                            let timeout = DispatchWorkItem { self.finish(.failure(ConnectError.expired)) }
                            self.timeout = timeout; self.queue.asyncAfter(deadline: .now() + self.lifetime, execute: timeout)
                        case .failed: self.finish(.failure(ConnectError.network))
                        default: break
                        }
                    }
                    listener.newConnectionHandler = { self.accept($0) }
                    listener.start(queue: self.queue)
                } catch { continuation.resume(throwing: ConnectError.network) }
            }
        }
    }
    func wait() async throws -> Grant {
        try await withCheckedThrowingContinuation { continuation in
            queue.async { if let result = self.result { continuation.resume(with: result) } else { self.waiting = continuation } }
        }
    }
    func cancel() { queue.async { self.finish(.failure(ConnectError.cancelled)) } }
    private func finish(_ result: Result<Grant, Error>) {
        guard self.result == nil else { return }
        self.result = result; timeout?.cancel()
        listener?.newConnectionHandler = nil; listener?.stateUpdateHandler = nil
        listener?.cancel(); listener = nil
        for connection in connections.values { connection.stateUpdateHandler = nil; connection.cancel() }; connections.removeAll()
        starting?.resume(throwing: ConnectError.cancelled); starting = nil
        waiting?.resume(with: result); waiting = nil
    }
    private func accept(_ connection: NWConnection) {
        guard result == nil, connections.count < 16 else { connection.cancel(); return }
        connections[ObjectIdentifier(connection)] = connection
        connection.stateUpdateHandler = { status in
            if case .failed = status { connection.cancel(); self.connections.removeValue(forKey: ObjectIdentifier(connection)) }
            if case .cancelled = status { connection.stateUpdateHandler = nil; self.connections.removeValue(forKey: ObjectIdentifier(connection)) }
        }
        connection.start(queue: queue)
        // Bound incomplete/idle browser requests as well as total callback waiting time.
        queue.asyncAfter(deadline: .now() + 10) { if self.connections[ObjectIdentifier(connection)] != nil { connection.cancel(); self.connections.removeValue(forKey: ObjectIdentifier(connection)) } }
        receive(connection, bytes: Data())
    }
    private func receive(_ connection: NWConnection, bytes: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 16_384) { data, _, complete, error in
            var bytes = bytes; if let data { bytes.append(data) }
            guard error == nil, bytes.count <= 16_384 else { connection.cancel(); return }
            guard let boundary = bytes.range(of: Data("\r\n\r\n".utf8)) else {
                if complete { connection.cancel() } else { self.receive(connection, bytes: bytes) }; return
            }
            let header = String(decoding: bytes[..<boundary.lowerBound], as: UTF8.self)
            let first = header.components(separatedBy: "\r\n").first?.components(separatedBy: " ") ?? []
            let callback = first.count == 3 && first[0] == "GET" && ["HTTP/1.0", "HTTP/1.1"].contains(first[2]) ? validateCallback(first[1], state: self.state, client: self.client) : .invalid
            let valid: Bool
            let terminal: Result<Grant, Error>?
            switch callback {
            case .invalid: valid = false; terminal = nil
            case .denied: valid = true; terminal = .failure(ConnectError.callback)
            case .grant(let grant): valid = true; terminal = .success(grant)
            }
            let body = valid ? "Puoi chiudere questa pagina e tornare all’app CounselorBot ChatGPT." : "Richiesta non valida."
            let payload = Data("HTTP/1.1 \(valid ? "200 OK" : "400 Bad Request")\r\nContent-Type: text/plain; charset=utf-8\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\nContent-Length: \(body.utf8.count)\r\n\r\n\(body)".utf8)
            connection.send(content: payload, completion: .contentProcessed { _ in
                connection.cancel(); self.connections.removeValue(forKey: ObjectIdentifier(connection))
                if let terminal { self.finish(terminal) }
            })
        }
    }
}
