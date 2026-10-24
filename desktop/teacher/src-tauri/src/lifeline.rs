//! Modalita' lifeline (ADR-0002 §2.4 punto 3), solo macOS e Linux.
//!
//! `counselorbot-teacher --lifeline [--pid-file <file>] -- <programma> <argomenti>`:
//! un processo minimo, senza finestra ne' webview, che avvia il programma
//! (`cloudflared`, che non legge stdin) come figlio e legge la pipe di vita su
//! stdin. A EOF, o a SIGTERM/SIGINT/SIGHUP, manda SIGTERM al figlio e SIGKILL
//! dopo 5 secondi. Se il figlio esce da solo, la lifeline esce con il suo codice.

#[cfg(unix)]
pub fn run(args: &[String]) -> i32 {
    use std::io::Read;
    use std::path::PathBuf;
    use std::process::{Command, Stdio};
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use std::time::{Duration, Instant};

    let mut pid_file: Option<PathBuf> = None;
    let mut rest = args;
    while let Some(first) = rest.first() {
        match first.as_str() {
            "--pid-file" if rest.len() > 1 => {
                pid_file = Some(PathBuf::from(&rest[1]));
                rest = &rest[2..];
            }
            "--" => {
                rest = &rest[1..];
                break;
            }
            _ => break,
        }
    }
    let Some((program, program_args)) = rest.split_first() else {
        eprintln!("lifeline: uso: --lifeline [--pid-file <file>] -- <programma> [argomenti]");
        return 2;
    };

    let stop = Arc::new(AtomicBool::new(false));
    for signal in [signal_hook::consts::SIGTERM, signal_hook::consts::SIGINT, signal_hook::consts::SIGHUP] {
        let _ = signal_hook::flag::register(signal, Arc::clone(&stop));
    }

    let mut command = Command::new(program);
    command.args(program_args).stdin(Stdio::null());
    crate::platform::prepare(&mut command);
    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) => {
            eprintln!("lifeline: avvio di {program} fallito: {error}");
            return 1;
        }
    };
    if let (Some(file), Some(record)) = (&pid_file, crate::pids::record("cloudflared", child.id())) {
        let records = [record];
        let _ = std::fs::write(file, serde_json::to_string_pretty(&records[..]).unwrap_or_default());
    }

    let eof = Arc::new(AtomicBool::new(false));
    {
        let eof = Arc::clone(&eof);
        std::thread::spawn(move || {
            let mut stdin = std::io::stdin();
            let mut buffer = [0u8; 256];
            // The shell never writes: read returns only at EOF (or on error).
            while matches!(stdin.read(&mut buffer), Ok(n) if n > 0) {}
            eof.store(true, Ordering::SeqCst);
        });
    }

    let remove_pid_file = || {
        if let Some(file) = &pid_file {
            let _ = std::fs::remove_file(file);
        }
    };
    loop {
        if let Ok(Some(status)) = child.try_wait() {
            remove_pid_file();
            return status.code().unwrap_or(1);
        }
        if eof.load(Ordering::SeqCst) || stop.load(Ordering::SeqCst) {
            break;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    unsafe {
        libc::kill(child.id() as libc::pid_t, libc::SIGTERM);
    }
    let deadline = Instant::now() + Duration::from_secs(5);
    while Instant::now() < deadline {
        if let Ok(Some(_)) = child.try_wait() {
            remove_pid_file();
            return 0;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    let _ = child.kill();
    let _ = child.wait();
    remove_pid_file();
    0
}

#[cfg(not(unix))]
pub fn run(_args: &[String]) -> i32 {
    // Windows uses the Job Object instead (ADR-0002 §2.4 punto 2).
    eprintln!("lifeline: non usata su questo sistema");
    2
}
