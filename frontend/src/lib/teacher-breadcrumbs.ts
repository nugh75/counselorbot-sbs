import type { Lang } from './i18n.ts';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { teacherAreaText } from './i18n-teacher-area.ts';
import type { TeacherAreaSlug } from './teacher-area.ts';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { classSettingsText, type classSettingsTexts } from './i18n-class-settings.ts';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { ADMIN_CLASSES_HREF } from './admin-navigation.ts';

export interface TeacherBreadcrumbItem {
    label: string;
    href?: string;
    current?: boolean;
}

/**
 * Mappatura gerarchica delle breadcrumb per ciascuna sottopagina dell'Area Docente.
 * Schema generale:
 * - Radice: "Area docenti" (/docente)
 * - Hub genitore intermedio se applicabile (es. /docente/risorse per strategie e materiali)
 * - Pagina o sezione attiva finale contrassegnata come current.
 */
export function getTeacherBreadcrumbsForSlug(slug: TeacherAreaSlug, lang: Lang): TeacherBreadcrumbItem[] {
    const root: TeacherBreadcrumbItem = {
        label: teacherAreaText(lang, 'title'),
        href: '/docente',
    };

    switch (slug) {
        case 'strategie':
            return [
                root,
                { label: teacherAreaText(lang, 'breadcrumbRisorse'), href: '/docente/risorse' },
                { label: teacherAreaText(lang, 'breadcrumbStrategie'), current: true },
            ];
        case 'materiali':
            return [
                root,
                { label: teacherAreaText(lang, 'breadcrumbRisorse'), href: '/docente/risorse' },
                { label: teacherAreaText(lang, 'breadcrumbMateriali'), current: true },
            ];
        case 'taccuini-prova':
            return [
                root,
                { label: teacherAreaText(lang, 'breadcrumbPalestra'), href: '/docente/palestra' },
                { label: teacherAreaText(lang, 'breadcrumbTaccuiniProva'), current: true },
            ];
        case 'catalogo-obiettivi':
            return [
                root,
                { label: teacherAreaText(lang, 'breadcrumbObiettivi'), current: true },
            ];
        case 'percorsi':
            return [
                root,
                { label: teacherAreaText(lang, 'breadcrumbPercorsi'), current: true },
            ];
        case 'assegnazioni':
            return [
                root,
                { label: teacherAreaText(lang, 'breadcrumbProposte'), current: true },
            ];
        case 'taccuino':
            return [
                root,
                { label: teacherAreaText(lang, 'breadcrumbTaccuino'), current: true },
            ];
        case 'risorse':
            return [
                root,
                { label: teacherAreaText(lang, 'breadcrumbRisorse'), current: true },
            ];
        case 'classi':
            return [
                root,
                { label: teacherAreaText(lang, 'breadcrumbClassi'), current: true },
            ];
        case 'compilazioni':
            return [
                root,
                { label: teacherAreaText(lang, 'breadcrumbCompilazioni'), current: true },
            ];
        case 'incontri':
            return [
                root,
                { label: teacherAreaText(lang, 'breadcrumbIncontri'), current: true },
            ];
        case 'istituti':
            return [
                root,
                { label: teacherAreaText(lang, 'breadcrumbIstituti'), current: true },
            ];
        case 'orientamento':
            return [
                root,
                { label: teacherAreaText(lang, 'breadcrumbOrientamento'), current: true },
            ];
        case 'somministrazioni':
            return [
                root,
                { label: teacherAreaText(lang, 'breadcrumbSomministrazioni'), current: true },
            ];
        default:
            return [root];
    }
}

/**
 * Breadcrumb per l'Hub di classe (/docente/classi/[id] o /admin/classi/[id]):
 * - In modalità admin (adminRoute=true):
 *   Dashboard Admin (/admin) > Classi (/admin?tab=groupsClasses) > [Nome Classe] > [Tab]
 * - In modalità docente (adminRoute=false):
 *   Area docenti (/docente) > [Nome Classe] > [Tab]
 */
export function getClassBreadcrumbs(
    groupName: string,
    groupId: number,
    tab: string,
    lang: Lang,
    adminRoute: boolean = false
): TeacherBreadcrumbItem[] {
    const classLabel = groupName || teacherAreaText(lang, 'classFallback');
    if (adminRoute) {
        const root: TeacherBreadcrumbItem = {
            label: classSettingsText(lang, 'adminDashboard'),
            href: '/admin',
        };
        const classes: TeacherBreadcrumbItem = {
            label: classSettingsText(lang, 'back'),
            href: ADMIN_CLASSES_HREF,
        };
        const classItem: TeacherBreadcrumbItem = {
            label: classLabel,
            href: tab !== 'overview' ? `/admin/classi/${groupId}` : undefined,
            current: tab === 'overview',
        };
        if (tab === 'overview') {
            return [root, classes, classItem];
        }
        return [
            root,
            classes,
            classItem,
            {
                label: classSettingsText(lang, tab as keyof typeof classSettingsTexts) || tab,
                current: true,
            },
        ];
    }

    const root: TeacherBreadcrumbItem = {
        label: teacherAreaText(lang, 'title'),
        href: '/docente',
    };
    const classItem: TeacherBreadcrumbItem = {
        label: classLabel,
        href: tab !== 'overview' ? `/docente/classi/${groupId}` : undefined,
        current: tab === 'overview',
    };
    if (tab === 'overview') {
        return [root, classItem];
    }
    return [
        root,
        classItem,
        {
            label: classSettingsText(lang, tab as keyof typeof classSettingsTexts) || tab,
            current: true,
        },
    ];
}
