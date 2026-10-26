import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error -- Node runs TypeScript files directly.
import { detectDeviceOs } from './device-os.ts';

const ua = {
    windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
    macos: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
    linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
    chromeos: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
    ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
    android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36',
};

test('desktop systems get their helper', () => {
    assert.equal(detectDeviceOs({ userAgent: ua.windows }), 'windows');
    assert.equal(detectDeviceOs({ userAgent: ua.macos }), 'macos');
    assert.equal(detectDeviceOs({ userAgent: ua.linux }), 'linux');
    assert.equal(detectDeviceOs({ userAgent: '', platform: 'Windows' }), 'windows');
});

test('Chromebooks, phones and tablets are not supported', () => {
    assert.equal(detectDeviceOs({ userAgent: ua.chromeos }), 'unsupported');
    assert.equal(detectDeviceOs({ userAgent: ua.ios }), 'unsupported');
    assert.equal(detectDeviceOs({ userAgent: ua.android }), 'unsupported');
    // iPadOS in desktop mode: a Mac user agent with a touch screen.
    assert.equal(detectDeviceOs({ userAgent: ua.macos, maxTouchPoints: 5 }), 'unsupported');
});

test('anything else is unknown', () => {
    assert.equal(detectDeviceOs({ userAgent: 'Mozilla/5.0 (compatible; Unknown)' }), 'unknown');
    assert.equal(detectDeviceOs({ userAgent: '' }), 'unknown');
});
