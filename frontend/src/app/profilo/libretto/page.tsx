import { redirect } from 'next/navigation';

// Il libretto è confluito in Compilazioni («La mia lettura»), Obiettivi e Linea del tempo.
export default async function Page({ searchParams }: { searchParams: Promise<{ instrument?: string | string[] }> }) {
    const { instrument } = await searchParams;
    const value = Array.isArray(instrument) ? instrument[0] : instrument;
    redirect(value ? `/profilo/compilazioni?instrument=${encodeURIComponent(value)}` : '/profilo/compilazioni');
}
