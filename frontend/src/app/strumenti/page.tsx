import { redirect } from 'next/navigation';

// Indirizzo stabile del catalogo strumenti: il catalogo vive nella home
// (`/?view=questionnaires`), qui c'è solo un nome da linkare e ricordare.
export default function StrumentiPage() {
    redirect('/?view=questionnaires');
}
