import { redirect } from 'next/navigation';

// #200: ChatGPT is now a section of the unified «API e ChatGPT» page.
export default function Page() {
    redirect('/profilo/api-personali#chatgpt');
}
