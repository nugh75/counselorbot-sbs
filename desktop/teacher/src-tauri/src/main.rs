// Guscio dell'app docente (F1-02): avvia, sorveglia e ferma i sidecar
// backend, frontend e cloudflared secondo i contratti di ADR-0002 §1-§2.
//
// Modalita':
//   (nessuna)               finestra con il pannello di stato
//   --headless              come sopra ma senza finestra (test in CI)
//   --smoke                 senza finestra: avvia tutto, scrive il report, ferma tutto, esce
//   --lifeline -- prog ...  processo minimo che tiene in vita `prog` finche' stdin e' aperto
//                           (cloudflared su macOS e Linux, ADR-0002 §2.4 punto 3)
// Con COUNSELORBOT_REPORT_FILE il guscio scrive lo stato in JSON quando e' pronto (o in errore).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app;
mod credentials;
mod datadir;
mod diagnostics;
mod health;
mod lifeline;
mod logs;
mod pids;
mod platform;
mod postgres_cluster;
mod sidecar;
mod sleep;
mod supervisor;
mod updater;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.get(1).map(String::as_str) == Some("--lifeline") {
        std::process::exit(lifeline::run(&args[2..]));
    }
    if args.get(1).map(String::as_str) == Some("--postgres-smoke") {
        let result = args
            .get(2)
            .zip(args.get(3))
            .ok_or_else(|| "Uso: --postgres-smoke <resources> <data-dir-isolata>".to_string())
            .and_then(|(resources, data)| postgres_cluster::smoke(resources.into(), data.into()));
        if let Err(error) = result {
            eprintln!("PostgreSQL smoke: {error}");
            std::process::exit(1);
        }
        return;
    }
    let mode = if args.iter().any(|a| a == "--smoke") {
        app::Mode::Smoke
    } else if args.iter().any(|a| a == "--headless") {
        app::Mode::Headless
    } else {
        app::Mode::Window
    };
    app::run(mode);
}
