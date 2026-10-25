declare module "@novnc/novnc/lib/rfb" {
  export default class RFB extends EventTarget {
    constructor(target: HTMLElement, url: string, options?: { shared?: boolean });
    scaleViewport: boolean; resizeSession: boolean; clipViewport: boolean; dragViewport: boolean; background: string;
    disconnect(): void; focus(): void; clipboardPasteFrom(text: string): void; sendKey(keysym: number, code?: string, down?: boolean): void;
  }
}
