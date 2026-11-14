import { redirect } from 'next/navigation';

// #902: the hub duplicated Strategie and Materiali, which the home lists directly.
export default function TeacherResourcesPage() {
    redirect('/docente/strategie');
}
