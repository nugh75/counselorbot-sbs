// Tool illustrations ported as-is from the approved flat-areas prototype (#863).
// Colours come from the --i-* variables defined in globals.css (light and dark).

export const ILLUSTRATION_VIEWBOX = "0 0 96 96";

const ILLUSTRATIONS: Record<string, string> = {
    QSA: "<rect x=\"18\" y=\"16\" width=\"48\" height=\"64\" rx=\"2\" fill=\"var(--i-paper)\"/><rect x=\"33\" y=\"11\" width=\"18\" height=\"10\" rx=\"2\" fill=\"var(--i-teal2)\"/><path d=\"M28 34l4 4 7-8M28 50l4 4 7-8M28 66l4 4 7-8\" stroke=\"var(--i-teal)\"/><path d=\"M44 35h14M44 51h14M44 67h10\"/><circle cx=\"72\" cy=\"62\" r=\"14\" fill=\"var(--i-yellow)\"/><path d=\"M66 62c2-6 10-6 12 0M68 68h8\"/>",
    QSAr: "<rect x=\"22\" y=\"20\" width=\"42\" height=\"54\" rx=\"2\" fill=\"var(--i-paper)\"/><rect x=\"34\" y=\"15\" width=\"18\" height=\"10\" rx=\"2\" fill=\"var(--i-teal2)\"/><path d=\"M31 38l4 4 7-8M31 55l4 4 7-8\" stroke=\"var(--i-teal)\"/><path d=\"M46 39h10M46 56h8\"/><path d=\"M72 30l-8 18h9l-7 18\" fill=\"var(--i-orange)\" stroke=\"var(--i-out)\"/>",
    QPCS: "<rect x=\"14\" y=\"18\" width=\"46\" height=\"62\" rx=\"2\" fill=\"var(--i-paper)\"/><rect x=\"28\" y=\"13\" width=\"18\" height=\"10\" rx=\"2\" fill=\"var(--i-teal2)\"/><path d=\"M24 38h26M24 48h20M24 58h24M24 68h14\"/><path d=\"M70 22l5 11 12 1-9 8 3 12-11-6-11 6 3-12-9-8 12-1z\" fill=\"var(--i-yellow)\"/>",
    QPCC: "<rect x=\"14\" y=\"18\" width=\"46\" height=\"62\" rx=\"2\" fill=\"var(--i-paper)\"/><rect x=\"28\" y=\"13\" width=\"18\" height=\"10\" rx=\"2\" fill=\"var(--i-teal2)\"/><path d=\"M24 38h26M24 48h20M24 58h24\"/><circle cx=\"70\" cy=\"58\" r=\"17\" fill=\"var(--i-sky)\"/><path d=\"M70 45v4M70 67v4M57 58h4M79 58h4\"/><path d=\"M76 52l-4 9-8 3 4-9z\" fill=\"var(--i-orange)\"/>",
    ZTPI: "<circle cx=\"44\" cy=\"50\" r=\"28\" fill=\"var(--i-paper)\"/><path d=\"M44 30v20l14 8\" stroke=\"var(--i-teal2)\" stroke-width=\"3.5\"/><path d=\"M20 26a32 32 0 0 1 12-8\" stroke=\"var(--i-orange)\" stroke-width=\"4\"/><path d=\"M76 52a32 32 0 0 1-6 18\" stroke=\"var(--i-teal)\" stroke-width=\"4\"/><path d=\"M66 20h20l-6 10h-8z\" fill=\"var(--i-yellow)\"/><path d=\"M72 30l-6 10h20l-6-10\" fill=\"var(--i-cream)\"/>",
    QAP: "<path d=\"M16 66c10-2 14-14 24-14s14 10 24 8 12-14 16-18\" stroke=\"var(--i-teal)\" stroke-width=\"4\"/><rect x=\"14\" y=\"24\" width=\"22\" height=\"22\" rx=\"2\" fill=\"var(--i-yellow)\"/><rect x=\"40\" y=\"16\" width=\"22\" height=\"22\" rx=\"2\" fill=\"var(--i-sky)\"/><rect x=\"64\" y=\"58\" width=\"20\" height=\"20\" rx=\"2\" fill=\"var(--i-orange)\"/><rect x=\"38\" y=\"62\" width=\"20\" height=\"20\" rx=\"2\" fill=\"var(--i-paper)\"/>",
    SAVICKAS: "<rect x=\"12\" y=\"20\" width=\"44\" height=\"30\" rx=\"2\" fill=\"var(--i-paper)\"/><path d=\"M22 50l-4 10 12-10\"  fill=\"var(--i-paper)\"/><path d=\"M22 31h24M22 39h16\"/><rect x=\"42\" y=\"42\" width=\"42\" height=\"30\" rx=\"2\" fill=\"var(--i-teal)\"/><path d=\"M72 72l6 10-14-10\" fill=\"var(--i-teal)\"/><path d=\"M52 53h22M52 61h14\" stroke=\"var(--i-paper)\"/><circle cx=\"74\" cy=\"22\" r=\"8\" fill=\"var(--i-yellow)\"/>",
    EVENTO_STUDIO: "<path d=\"M14 30c10-4 20-4 34 2v46c-14-6-24-6-34-2z\" fill=\"var(--i-paper)\"/><path d=\"M82 30c-10-4-20-4-34 2v46c14-6 24-6 34-2z\" fill=\"var(--i-cream)\"/><path d=\"M22 42h18M22 52h14M56 42h18M56 52h12\"/><circle cx=\"70\" cy=\"22\" r=\"10\" fill=\"var(--i-orange)\"/><path d=\"M66 22l3 3 6-6\" stroke=\"var(--i-paper)\"/>",
    EVENTO_PROFESSIONALE: "<rect x=\"14\" y=\"34\" width=\"60\" height=\"42\" rx=\"2\" fill=\"var(--i-teal)\"/><path d=\"M34 34v-8h20v8\"/><path d=\"M14 52h60\" stroke=\"var(--i-paper)\"/><rect x=\"40\" y=\"48\" width=\"8\" height=\"8\" rx=\"2\" fill=\"var(--i-yellow)\"/><circle cx=\"76\" cy=\"26\" r=\"10\" fill=\"var(--i-orange)\"/><path d=\"M72 26l3 3 6-6\" stroke=\"var(--i-paper)\"/>",
    OBIETTIVO_STUDIO: "<circle cx=\"44\" cy=\"52\" r=\"28\" fill=\"var(--i-paper)\"/><circle cx=\"44\" cy=\"52\" r=\"18\" fill=\"var(--i-sky)\"/><circle cx=\"44\" cy=\"52\" r=\"8\" fill=\"var(--i-orange)\"/><path d=\"M44 52l32-32\" stroke=\"var(--i-teal2)\" stroke-width=\"3\"/><path d=\"M70 14l6 6 8-2-6-6z\" fill=\"var(--i-teal)\"/>",
    OBIETTIVO_DOCENZA: "<rect x=\"10\" y=\"16\" width=\"56\" height=\"40\" rx=\"2\" fill=\"var(--i-teal2)\"/><path d=\"M20 30h20M20 40h28\" stroke=\"var(--i-paper)\"/><path d=\"M30 56l-6 20M46 56l6 20\"/><circle cx=\"70\" cy=\"62\" r=\"16\" fill=\"var(--i-paper)\"/><circle cx=\"70\" cy=\"62\" r=\"9\" fill=\"var(--i-yellow)\"/><circle cx=\"70\" cy=\"62\" r=\"3\" fill=\"var(--i-orange)\"/>",
    IDEA: "<path d=\"M44 14a22 22 0 0 1 13 40v8H31v-8a22 22 0 0 1 13-40z\" fill=\"var(--i-yellow)\"/><path d=\"M33 68h22M35 76h18\"/><circle cx=\"76\" cy=\"30\" r=\"6\" fill=\"var(--i-teal)\"/><circle cx=\"80\" cy=\"62\" r=\"6\" fill=\"var(--i-sky)\"/><path d=\"M58 38l12-6M58 50l16 8\" stroke=\"var(--i-teal2)\"/>",
};

const CATEGORY_IMAGES = { assessment: "/images/intro/profiles.png", other: "/images/intro/paths.png" } as const;

export type ToolIllustrationSource =
    | { kind: "svg"; body: string }
    | { kind: "image"; src: string };

/** Inline illustration for a known tool id; the category image for dynamic/unknown tools. */
export function toolIllustration(id: string, category?: string): ToolIllustrationSource {
    const body = Object.hasOwn(ILLUSTRATIONS, id) ? ILLUSTRATIONS[id] : undefined;
    if (body) return { kind: "svg", body };
    return { kind: "image", src: category === "assessment" ? CATEGORY_IMAGES.assessment : CATEGORY_IMAGES.other };
}
