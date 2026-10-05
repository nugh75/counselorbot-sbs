import AppKit
import Foundation

#if SELF_TEST
Task { @MainActor in
    do { try await runSelfTests(); print("macOS helper: protocol/security self-tests passed"); exit(0) }
    catch { fputs("macOS helper: self-test failed (details suppressed)\n", stderr); exit(1) }
}
RunLoop.main.run()
#else
@MainActor final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    private var window: NSWindow!
    private let origin = NSTextField(string: "https://counselorbot.labform.net")
    private let pairing = NSSecureTextField(string: "")
    private let status = NSTextField(wrappingLabelWithString: "")
    private let connectButton = NSButton(title: "Collega con ChatGPT", target: nil, action: nil)
    private let cancelButton = NSButton(title: "Annulla", target: nil, action: nil)
    private let indicator = NSProgressIndicator()
    private var connector: Connector?
    private var operation: Task<Void, Never>?
    private var stage: ConnectStage = .parameters
    func applicationDidFinishLaunching(_ notification: Notification) {
        // Standard native Edit menu enables Command-V in the secure code field.
        let menu = NSMenu()
        let appItem = NSMenuItem(); let appMenu = NSMenu()
        appMenu.addItem(withTitle: "Esci da CounselorBot ChatGPT", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu; menu.addItem(appItem)
        let editItem = NSMenuItem(title: "Modifica", action: nil, keyEquivalent: "")
        let edit = NSMenu(title: "Modifica")
        for (title, action, key) in [("Taglia", "cut:", "x"), ("Copia", "copy:", "c"), ("Incolla", "paste:", "v"), ("Seleziona tutto", "selectAll:", "a")] {
            edit.addItem(withTitle: title, action: Selector(action), keyEquivalent: key)
        }
        editItem.submenu = edit; menu.addItem(editItem); NSApp.mainMenu = menu
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 590, height: 560), styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
        window.title = "CounselorBot · Collegamento ChatGPT"; window.delegate = self
        window.isReleasedWhenClosed = false; window.center()
        let title = NSTextField(labelWithString: "Collega il tuo account ChatGPT")
        title.font = .boldSystemFont(ofSize: 21)
        let introduction = NSTextField(wrappingLabelWithString: "Apri questa app sul Mac in cui usi il browser. In CounselorBot premi Collega ChatGPT, copia il codice di associazione e incollalo qui. Si aprirà l’accesso ufficiale di ChatGPT.")
        introduction.font = .systemFont(ofSize: 13)
        let serverLabel = NSTextField(labelWithString: "Indirizzo di CounselorBot")
        let codeLabel = NSTextField(labelWithString: "Codice di associazione CounselorBot (scade in 10 minuti)")
        origin.placeholderString = "https://counselorbot.labform.net"
        pairing.placeholderString = "Incolla il codice mostrato da CounselorBot"
        pairing.setAccessibilityLabel("Codice di associazione CounselorBot")
        origin.setAccessibilityLabel("Indirizzo di CounselorBot")
        let privacy = NSTextField(wrappingLabelWithString: "Il codice non è una chiave API o un token OpenAI. Questa app non mostra né salva i token di accesso. Non incollare credenziali OpenAI.")
        privacy.font = .systemFont(ofSize: 12); privacy.textColor = .secondaryLabelColor
        status.font = .systemFont(ofSize: 13); status.setAccessibilityLabel("Stato del collegamento")
        connectButton.target = self; connectButton.action = #selector(connect)
        connectButton.bezelStyle = .rounded; connectButton.keyEquivalent = "\r"
        cancelButton.target = self; cancelButton.action = #selector(cancel)
        cancelButton.bezelStyle = .rounded; cancelButton.isEnabled = false
        indicator.style = .spinning; indicator.controlSize = .small; indicator.isDisplayedWhenStopped = false
        let buttons = NSStackView(views: [indicator, cancelButton, connectButton]); buttons.orientation = .horizontal; buttons.spacing = 12
        let stack = NSStackView(views: [title, introduction, serverLabel, origin, codeLabel, pairing, privacy, buttons, status])
        stack.orientation = .vertical; stack.alignment = .leading; stack.spacing = 14
        stack.translatesAutoresizingMaskIntoConstraints = false
        let content = window.contentView!; content.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 26),
            stack.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -26),
            stack.topAnchor.constraint(equalTo: content.topAnchor, constant: 26),
            origin.widthAnchor.constraint(equalTo: stack.widthAnchor), pairing.widthAnchor.constraint(equalTo: stack.widthAnchor),
            introduction.widthAnchor.constraint(equalTo: stack.widthAnchor), privacy.widthAnchor.constraint(equalTo: stack.widthAnchor),
            status.widthAnchor.constraint(equalTo: stack.widthAnchor)
        ])
        window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true)
    }
    @objc private func connect() {
        guard operation == nil else { return }
        let serverURL: URL
        do { serverURL = try serverOrigin(origin.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)) }
        catch { status.stringValue = "Usa un indirizzo HTTPS senza percorso, credenziali o parametri. HTTP è consentito solo su localhost."; return }
        let code = pairing.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard validPairing(code) else { status.stringValue = "Incolla il codice di associazione generato da CounselorBot, non un token OpenAI."; return }
        pairing.stringValue = "" // no retained field contents during/after transfer
        origin.isEnabled = false; pairing.isEnabled = false
        connectButton.isEnabled = false; cancelButton.isEnabled = true; indicator.startAnimation(nil)
        let connection = Connector(); connector = connection; stage = .parameters
        operation = Task { [weak self] in
            guard let self else { return }
            do {
                try await connection.connect(origin: serverURL, pairing: code) { self.stage = $0; self.status.stringValue = $0.rawValue }
                try Task.checkCancellation()
                self.status.stringValue = "Account collegato. Torna in CounselorBot, scegli un modello e attiva l’uso del tuo abbonamento. Puoi chiudere questa app."
            } catch {
                self.status.stringValue = Task.isCancelled ? "Collegamento annullato. Genera un nuovo codice in CounselorBot per riprovare." : self.stage.failure
            }
            self.connector = nil; self.operation = nil
            self.origin.isEnabled = true; self.pairing.isEnabled = true
            self.connectButton.isEnabled = true; self.cancelButton.isEnabled = false; self.indicator.stopAnimation(nil)
        }
    }
    @objc private func cancel() { operation?.cancel(); connector?.cancel() }
    func windowWillClose(_ notification: Notification) { cancel(); NSApp.terminate(nil) }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func applicationWillTerminate(_ notification: Notification) { cancel() }
}
MainActor.assumeIsolated {
    let app = NSApplication.shared
    let delegate = AppDelegate()
    app.setActivationPolicy(.regular); app.delegate = delegate; app.run()
}
#endif
