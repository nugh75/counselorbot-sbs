//! Anti-sospensione a lezione attiva (F1-14, piano §3.6).
//!
//! Il guscio tiene il PC sveglio mentre backend, frontend e tunnel sono attivi:
//! - macOS: asserzione IOKit `PreventUserIdleSystemSleep`;
//! - Windows: `SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED)`;
//! - altri sistemi: nessuna inibizione (il guscio non e' distribuito su Linux in Fase 1).
//!
//! Windows lega lo stato al thread chiamante: tutte le chiamate passano dal
//! thread del supervisore, che vive quanto il guscio.

/// Operazioni di sistema, separate per poterle sostituire nei test.
pub trait Inhibitor {
    fn acquire(&mut self) -> Result<(), String>;
    fn release(&mut self);
}

/// Mantiene al piu' un'inibizione attiva; rilascia in `Drop`.
pub struct SleepGuard<I: Inhibitor> {
    inhibitor: I,
    held: bool,
}

impl<I: Inhibitor> SleepGuard<I> {
    pub fn new(inhibitor: I) -> Self {
        SleepGuard { inhibitor, held: false }
    }

    pub fn is_held(&self) -> bool {
        self.held
    }

    /// Porta l'inibizione allo stato voluto; chiamate ripetute non fanno nulla.
    /// Restituisce un messaggio solo quando l'acquisizione fallisce.
    pub fn set(&mut self, wanted: bool) -> Option<String> {
        if wanted == self.held {
            return None;
        }
        if wanted {
            match self.inhibitor.acquire() {
                Ok(()) => self.held = true,
                Err(error) => return Some(error),
            }
        } else {
            self.inhibitor.release();
            self.held = false;
        }
        None
    }
}

impl<I: Inhibitor> Drop for SleepGuard<I> {
    fn drop(&mut self) {
        self.set(false);
    }
}

#[cfg(target_os = "macos")]
mod system {
    use super::Inhibitor;
    use std::ffi::{c_char, c_void, CString};

    type CFStringRef = *const c_void;

    #[link(name = "IOKit", kind = "framework")]
    extern "C" {
        fn IOPMAssertionCreateWithName(
            assertion_type: CFStringRef,
            level: u32,
            name: CFStringRef,
            id: *mut u32,
        ) -> i32;
        fn IOPMAssertionRelease(id: u32) -> i32;
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFStringCreateWithCString(alloc: *const c_void, s: *const c_char, encoding: u32) -> CFStringRef;
        fn CFRelease(object: *const c_void);
    }

    const UTF8: u32 = 0x0800_0100;
    const ASSERTION_ON: u32 = 255;

    #[derive(Default)]
    pub struct System {
        id: Option<u32>,
    }

    fn cf_string(text: &str) -> CFStringRef {
        let text = CString::new(text).expect("no NUL");
        unsafe { CFStringCreateWithCString(std::ptr::null(), text.as_ptr(), UTF8) }
    }

    impl Inhibitor for System {
        fn acquire(&mut self) -> Result<(), String> {
            let kind = cf_string("PreventUserIdleSystemSleep");
            let name = cf_string("CounselorBot: lezione attiva");
            let mut id = 0u32;
            let status = unsafe { IOPMAssertionCreateWithName(kind, ASSERTION_ON, name, &mut id) };
            unsafe {
                CFRelease(kind);
                CFRelease(name);
            }
            if status != 0 {
                return Err(format!("IOPMAssertionCreateWithName: codice {status}"));
            }
            self.id = Some(id);
            Ok(())
        }

        fn release(&mut self) {
            if let Some(id) = self.id.take() {
                unsafe { IOPMAssertionRelease(id) };
            }
        }
    }
}

#[cfg(windows)]
mod system {
    use super::Inhibitor;
    use windows_sys::Win32::System::Power::{SetThreadExecutionState, ES_CONTINUOUS, ES_SYSTEM_REQUIRED};

    #[derive(Default)]
    pub struct System;

    impl Inhibitor for System {
        fn acquire(&mut self) -> Result<(), String> {
            match unsafe { SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED) } {
                0 => Err("SetThreadExecutionState non ha accettato la richiesta".into()),
                _ => Ok(()),
            }
        }

        fn release(&mut self) {
            unsafe { SetThreadExecutionState(ES_CONTINUOUS) };
        }
    }
}

#[cfg(not(any(target_os = "macos", windows)))]
mod system {
    use super::Inhibitor;

    #[derive(Default)]
    pub struct System;

    impl Inhibitor for System {
        fn acquire(&mut self) -> Result<(), String> {
            Ok(())
        }
        fn release(&mut self) {}
    }
}

pub use system::System;

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    #[derive(Clone, Default)]
    struct Fake {
        calls: Arc<Mutex<Vec<&'static str>>>,
        fail: bool,
    }

    impl Inhibitor for Fake {
        fn acquire(&mut self) -> Result<(), String> {
            if self.fail {
                return Err("rifiutato".into());
            }
            self.calls.lock().unwrap().push("acquire");
            Ok(())
        }
        fn release(&mut self) {
            self.calls.lock().unwrap().push("release");
        }
    }

    #[test]
    fn acquires_once_and_releases_once() {
        let fake = Fake::default();
        let mut guard = SleepGuard::new(fake.clone());
        assert!(guard.set(true).is_none());
        assert!(guard.set(true).is_none());
        assert!(guard.is_held());
        guard.set(false);
        guard.set(false);
        assert!(!guard.is_held());
        assert_eq!(*fake.calls.lock().unwrap(), ["acquire", "release"]);
    }

    #[test]
    fn failed_acquire_is_reported_and_retried() {
        let mut guard = SleepGuard::new(Fake { fail: true, ..Fake::default() });
        assert_eq!(guard.set(true).as_deref(), Some("rifiutato"));
        assert!(!guard.is_held());
        assert!(guard.set(true).is_some());
    }

    #[test]
    fn drop_releases_a_held_assertion() {
        let fake = Fake::default();
        drop({
            let mut guard = SleepGuard::new(fake.clone());
            guard.set(true);
            guard
        });
        assert_eq!(*fake.calls.lock().unwrap(), ["acquire", "release"]);
    }

    #[test]
    fn system_inhibitor_round_trips() {
        let mut guard = SleepGuard::new(System::default());
        // In CI senza sessione grafica l'acquisizione puo' fallire: non e' un errore del test.
        if guard.set(true).is_none() {
            assert!(guard.is_held());
        }
        guard.set(false);
        assert!(!guard.is_held());
    }
}
