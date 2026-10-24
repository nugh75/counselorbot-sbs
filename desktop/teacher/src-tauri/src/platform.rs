//! Difese di arresto dipendenti dal sistema (ADR-0002 §2.4).
//!
//! - Windows: tutti i sidecar in un Job Object con KILL_ON_JOB_CLOSE (il sistema
//!   li chiude quando il guscio termina, anche `cloudflared`), CREATE_NO_WINDOW.
//! - Linux: PR_SET_PDEATHSIG(SIGTERM) nel figlio come rinforzo della pipe di vita.
//!   Il segnale parte quando muore il *thread* che ha avviato il figlio: per questo
//!   tutti gli avvii passano dal thread del supervisore, che vive quanto il guscio.
//! - macOS: nessuna delle due; bastano la pipe di vita e la lifeline.

use std::process::{Child, Command};

#[cfg(windows)]
pub struct Job(windows_sys::Win32::Foundation::HANDLE);

#[cfg(windows)]
unsafe impl Send for Job {}
#[cfg(windows)]
unsafe impl Sync for Job {}

#[cfg(windows)]
impl Job {
    pub fn new() -> std::io::Result<Job> {
        use windows_sys::Win32::System::JobObjects::{
            CreateJobObjectW, JobObjectExtendedLimitInformation, SetInformationJobObject,
            JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        };
        // The handle is never closed: it dies with the shell, and so do the sidecars.
        unsafe {
            let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if job.is_null() {
                return Err(std::io::Error::last_os_error());
            }
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let ok = SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                &info as *const _ as *const core::ffi::c_void,
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            );
            if ok == 0 {
                return Err(std::io::Error::last_os_error());
            }
            Ok(Job(job))
        }
    }

    pub fn assign(&self, child: &Child) -> std::io::Result<()> {
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::System::JobObjects::AssignProcessToJobObject;
        let ok = unsafe { AssignProcessToJobObject(self.0, child.as_raw_handle() as _) };
        if ok == 0 {
            return Err(std::io::Error::last_os_error());
        }
        Ok(())
    }
}

#[cfg(not(windows))]
pub struct Job;

#[cfg(not(windows))]
impl Job {
    pub fn new() -> std::io::Result<Job> {
        Ok(Job)
    }

    pub fn assign(&self, _child: &Child) -> std::io::Result<()> {
        Ok(())
    }
}

/// Flags every sidecar gets before spawn.
pub fn prepare(command: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(target_os = "linux")]
    {
        use std::os::unix::process::CommandExt;
        let parent = std::process::id() as libc::pid_t;
        unsafe {
            command.pre_exec(move || {
                if libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGTERM) != 0 {
                    return Err(std::io::Error::last_os_error());
                }
                // The parent may have died between fork and prctl.
                if libc::getppid() != parent {
                    return Err(std::io::Error::from_raw_os_error(libc::ESRCH));
                }
                Ok(())
            });
        }
    }
    #[cfg(not(any(windows, target_os = "linux")))]
    let _ = command;
}

/// Polite stop request: SIGTERM on Unix. On Windows there is no such signal:
/// closing the stdin pipe is the request (done by the caller).
pub fn request_stop(child: &Child) {
    #[cfg(unix)]
    unsafe {
        libc::kill(child.id() as libc::pid_t, libc::SIGTERM);
    }
    #[cfg(not(unix))]
    let _ = child;
}
