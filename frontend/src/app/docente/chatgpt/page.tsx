import { redirect } from 'next/navigation';

// #200: ChatGPT is now a section of the unified «API e ChatGPT» page.
export default function Page() {
    redirect('/docente/api-personali#chatgpt');
}
