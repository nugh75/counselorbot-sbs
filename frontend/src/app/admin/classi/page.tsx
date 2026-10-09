import { redirect } from 'next/navigation';
import { ADMIN_CLASSES_HREF } from '@/lib/admin-navigation';

// La directory delle classi vive nella scheda «Gruppi e classi» della console
// admin, con la sua navigazione: qui resta solo il vecchio indirizzo.
export default function AdminClassesPage() {
    redirect(ADMIN_CLASSES_HREF);
}
