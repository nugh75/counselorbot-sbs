// #134: which ChatGPT helper fits the user's computer. Phones, tablets and
// Chromebooks cannot run a helper, so they get a plain explanation instead.
export type DeviceOs = 'windows' | 'macos' | 'linux' | 'unsupported' | 'unknown';

export interface DeviceSignals {
    userAgent: string;
    /** navigator.userAgentData?.platform, when the browser provides it. */
    platform?: string;
    /** navigator.maxTouchPoints: iPadOS reports a Mac user agent with touch. */
    maxTouchPoints?: number;
}

export function detectDeviceOs({ userAgent, platform = '', maxTouchPoints = 0 }: DeviceSignals): DeviceOs {
    const ua = userAgent || '';
    const hint = platform.toLowerCase();
    if (/CrOS/.test(ua) || hint === 'chrome os' || hint === 'chromeos') return 'unsupported';
    if (/Android/i.test(ua) || hint === 'android') return 'unsupported';
    if (/iPhone|iPad|iPod/.test(ua) || hint === 'ios') return 'unsupported';
    // iPadOS in desktop mode presents itself as a Mac with a touch screen.
    if (/Macintosh/.test(ua) && maxTouchPoints > 1) return 'unsupported';
    if (/Windows/.test(ua) || hint === 'windows') return 'windows';
    if (/Macintosh|Mac OS X/.test(ua) || hint === 'macos') return 'macos';
    if (/Linux|X11/.test(ua) || hint === 'linux') return 'linux';
    return 'unknown';
}

export function currentDeviceOs(): DeviceOs {
    if (typeof navigator === 'undefined') return 'unknown';
    const data = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
    return detectDeviceOs({ userAgent: navigator.userAgent, platform: data?.platform, maxTouchPoints: navigator.maxTouchPoints });
}
