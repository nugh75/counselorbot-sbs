import AppKit
import Foundation
import CryptoKit

enum ConnectStage: String {
    case parameters = "Verifico il codice di associazione…"
    case browser = "Completa l’accesso nella pagina ufficiale di ChatGPT aperta nel browser."
    case registration = "Confermo l’associazione…"
    case exchange = "Completo l’accesso con ChatGPT…"
    case complete = "Collego l’account a CounselorBot…"
    var failure: String {
        switch self {
        case .parameters: return "Non riesco a verificare il codice. Controlla l’indirizzo e genera un nuovo codice in CounselorBot."
        case .browser: return "Accesso annullato, scaduto o browser non disponibile. Genera un nuovo codice e riprova."
        case .registration: return "Associazione non riuscita. Genera un nuovo codice in CounselorBot e riprova."
        case .exchange: return "ChatGPT non ha completato l’accesso. Genera un nuovo codice e riprova."
        case .complete: return "CounselorBot non ha accettato il collegamento. Genera un nuovo codice e riprova."
        }
    }
}
@MainActor final class Connector {
    private let transport: JSONTransport
    private let openBrowser: (URL) -> Bool
    private var server: CallbackServer?
    init(transport: JSONTransport = HTTPClient(), openBrowser: @escaping (URL) -> Bool = { NSWorkspace.shared.open($0) }) {
        self.transport = transport; self.openBrowser = openBrowser
    }
    func cancel() { server?.cancel(); transport.cancel() }
    func connect(origin: URL, pairing: String, progress: (ConnectStage) -> Void) async throws {
        defer { server?.cancel(); server = nil; transport.cancel() }
        guard validPairing(pairing) else { throw ConnectError.invalidPairing }
        func endpoint(_ path: String) -> URL { origin.appendingPathComponent(path) }
        progress(.parameters)
        let parameters = try await transport.request(endpoint("api/chatgpt/link/parameters"), bearer: pairing, json: nil, form: nil)
        func parameter(_ name: String) throws -> String {
            guard let value = parameters[name] as? String, !value.isEmpty, value.utf8.count <= 2048 else { throw ConnectError.response }
            return value
        }
        let client = try parameter("client_id"), nonce = try parameter("nonce"), host = try parameter("host_id")
        let state = try randomValue(32), verifier = try randomValue(48)
        let challenge = base64URL(Data(SHA256.hash(data: Data(verifier.utf8))))
        try Task.checkCancellation()
        let callbackServer = CallbackServer(state: state, client: client)
        server = callbackServer
        let redirect = try await callbackServer.start()
        try Task.checkCancellation()
        var authorization = URLComponents(string: oauthIssuer + "/api/accounts/authorize")!
        var fields = ["client_id": client, "ext_agent_host_id": host, "response_type": "code", "redirect_uri": redirect.absoluteString,
                      "scope": oauthScopes, "resource": oauthResource, "state": state, "nonce": nonce,
                      "code_challenge": challenge, "code_challenge_method": "S256"]
        if client == "dynamic_agent_client" { fields["agent_name_hint"] = try parameter("agent_name") }
        authorization.queryItems = fields.sorted { $0.key < $1.key }.map { URLQueryItem(name: $0.key, value: $0.value) }
        progress(.browser)
        guard let authorizeURL = authorization.url, openBrowser(authorizeURL) else { throw ConnectError.browser }
        let grant = try await callbackServer.wait()
        try Task.checkCancellation()
        // Persist registration before exchanging a one-time code, as in the CLI.
        progress(.registration)
        _ = try await transport.request(endpoint("api/chatgpt/link/registration"), bearer: pairing, json: ["client_id": grant.clientID], form: nil)
        try Task.checkCancellation()
        progress(.exchange)
        let tokens = try await transport.request(URL(string: oauthIssuer + "/api/accounts/oauth/token")!, bearer: nil, json: nil, form: [
            "grant_type": "authorization_code", "client_id": grant.clientID, "code": grant.code,
            "redirect_uri": redirect.absoluteString, "code_verifier": verifier, "resource": oauthResource])
        var credentials: [String: Any] = ["client_id": grant.clientID]
        for (name, limit) in [("access_token", 32768), ("refresh_token", 16000), ("id_token", 32768), ("token_type", 16)] {
            guard let value = tokens[name] as? String, !value.isEmpty, value.utf8.count <= limit else { throw ConnectError.response }
            credentials[name] = value
        }
        for name in ["scope", "earliest_refresh_at"] { if let value = tokens[name] { credentials[name] = value } }
        try Task.checkCancellation()
        progress(.complete)
        _ = try await transport.request(endpoint("api/chatgpt/link/complete"), bearer: pairing, json: credentials, form: nil)
        // No credentials are returned to AppKit, logged or written to disk.
    }
}
