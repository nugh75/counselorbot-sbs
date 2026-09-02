// Le chat in streaming aggiornano lo stato a ogni token, quindi l'effetto che
// segue il fondo scatta decine di volte al secondo. Due regole lo rendono
// sopportabile: scrollare il proprio contenitore e non gli antenati, e smettere
// di inseguire il fondo appena il lettore e' risalito a rileggere.
//
// Il modulo non importa nulla di proposito, cosi' resta eseguibile da
// `node --test` (vedi chat-scroll.test.ts).

/** Porzione di un elemento scrollabile: basta questa per decidere. */
export interface ScrollBox {
    scrollHeight: number;
    scrollTop: number;
    clientHeight: number;
}

/**
 * Il lettore e' abbastanza vicino al fondo perche' lo streaming possa tenercelo.
 * La soglia esiste perche' ogni token allunga il contenitore: senza margine,
 * chi sta leggendo l'ultima riga risulterebbe "risalito" al token successivo.
 */
export function isNearBottom(el: ScrollBox, threshold = 80): boolean {
    return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
}
