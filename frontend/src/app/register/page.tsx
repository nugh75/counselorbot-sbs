'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { Lock, User, Check, AlertCircle } from 'lucide-react';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { cn } from '@/lib/utils';

const registerSchema = z.object({
    username: z.string().min(3, 'Username must be at least 3 characters'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
});

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterPage() {
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<RegisterForm>({
        resolver: zodResolver(registerSchema)
    });

    const onSubmit = async (data: RegisterForm) => {
        setError(null);
        try {
            const res = await fetch(`/counselorbot/api/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    username: data.username,
                    password: data.password
                }),
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.detail || 'Registrazione fallita');
            }

            setSuccess(true);
            setTimeout(() => router.push('/login'), 2000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Errore durante la registrazione');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
            <div className="w-full max-w-md space-y-8 glass-panel p-8 rounded-2xl border border-white/10">
                <div className="text-center">
                    <div className="mx-auto w-12 h-12 bg-purple-600/20 rounded-full flex items-center justify-center mb-4">
                        <User className="w-6 h-6 text-purple-400" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900">Nuovo Account</h2>
                    <p className="text-muted-foreground mt-2">Crea un account per accedere a CounselorBot</p>
                </div>

                {success ? (
                    <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg text-center space-y-2">
                        <div className="w-10 h-10 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-2">
                            <Check className="w-6 h-6 text-green-500" />
                        </div>
                        <h3 className="text-green-700 font-medium">Registrazione Completata!</h3>
                        <p className="text-green-600 text-sm">Reindirizzamento al login...</p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">Username</label>
                            <div className="relative">
                                <User className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                                <input
                                    {...register('username')}
                                    type="text"
                                    className={cn(
                                        "w-full bg-white border border-gray-200 rounded-lg py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-purple-500 outline-none text-gray-900",
                                        errors.username && "border-red-300 focus:ring-red-200"
                                    )}
                                    placeholder="Il tuo username"
                                />
                            </div>
                            {errors.username && <p className="text-red-500 text-xs mt-1">{errors.username.message}</p>}
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                                <input
                                    {...register('password')}
                                    type="password"
                                    className={cn(
                                        "w-full bg-white border border-gray-200 rounded-lg py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-purple-500 outline-none text-gray-900",
                                        errors.password && "border-red-300 focus:ring-red-200"
                                    )}
                                    placeholder="••••••••"
                                />
                            </div>
                            {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">Conferma Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                                <input
                                    {...register('confirmPassword')}
                                    type="password"
                                    className={cn(
                                        "w-full bg-white border border-gray-200 rounded-lg py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-purple-500 outline-none text-gray-900",
                                        errors.confirmPassword && "border-red-300 focus:ring-red-200"
                                    )}
                                    placeholder="••••••••"
                                />
                            </div>
                            {errors.confirmPassword && <p className="text-red-500 text-xs mt-1">{errors.confirmPassword.message}</p>}
                        </div>

                        {error && (
                            <div className="p-3 rounded-lg bg-red-50 border border-red-100 flex items-center gap-2 text-red-600 text-sm">
                                <AlertCircle className="w-4 h-4" />
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                        >
                            {isSubmitting ? 'Registrazione...' : 'Crea Account'}
                        </button>

                        <div className="text-center text-sm text-gray-500">
                            Hai già un account?{' '}
                            <Link href="/login" className="text-purple-600 hover:underline font-medium">
                                Accedi qui
                            </Link>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
