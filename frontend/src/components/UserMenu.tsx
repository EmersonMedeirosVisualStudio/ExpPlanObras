
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { LogOut, Key } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface User {
    name?: string | null;
    email?: string | null;
    isSystemAdmin?: boolean;
}

export function UserMenu() {
    const router = useRouter();
    const [currentUser] = useState<User | null>(() => {
        if (typeof window === 'undefined') return null;
        const user = localStorage.getItem('user');
        if (!user) return null;
        try {
            return JSON.parse(user) as User;
        } catch {
            return null;
        }
    });
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [passwordData, setPasswordData] = useState({ oldPassword: '', newPassword: '' });
    const [passwordError, setPasswordError] = useState('');

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('subscription_alert');
        localStorage.removeItem('pending_user');
        try {
            localStorage.removeItem('active_profile');
            localStorage.removeItem('available_profiles');
            localStorage.removeItem('active_context');
        } catch {
        }
        document.cookie = 'exp_user=; Path=/; Max-Age=0; SameSite=Lax';
        document.cookie = 'exp_token=; Path=/; Max-Age=0; SameSite=Lax';
        router.push('/login');
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setPasswordError('');
        try {
            await api.put('/api/auth/change-password', passwordData);
            alert('Senha alterada com sucesso!');
            setShowPasswordModal(false);
            setPasswordData({ oldPassword: '', newPassword: '' });
        } catch (err: unknown) {
            const message =
                typeof err === 'object' && err && 'response' in err
                    ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
                    : undefined;
            setPasswordError(message || 'Erro ao alterar senha');
        }
    };

    if (!currentUser) return null;

    const displayName =
        (typeof currentUser.name === 'string' && currentUser.name.trim().length > 0 ? currentUser.name.trim() : '') ||
        (typeof currentUser.email === 'string' && currentUser.email.trim().length > 0 ? currentUser.email.trim() : '') ||
        'Usuário';

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center space-x-2 focus:outline-none">
                    <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold">
                        {displayName.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-gray-700">{displayName}</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                    <DropdownMenuLabel>Minha Conta</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setShowPasswordModal(true)}>
                        <Key className="mr-2 h-4 w-4" />
                        <span>Trocar Senha</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                        <LogOut className="mr-2 h-4 w-4" />
                        <span>Sair</span>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            {/* Password Modal */}
            {showPasswordModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-lg max-w-sm w-full p-6">
                        <h2 className="text-xl font-bold mb-4">Trocar Senha</h2>
                        <form onSubmit={handleChangePassword} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Senha Atual</label>
                                <input 
                                    type="password" 
                                    required 
                                    value={passwordData.oldPassword} 
                                    onChange={(e) => setPasswordData({...passwordData, oldPassword: e.target.value})} 
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" 
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Nova Senha</label>
                                <input 
                                    type="password" 
                                    required 
                                    minLength={6}
                                    value={passwordData.newPassword} 
                                    onChange={(e) => setPasswordData({...passwordData, newPassword: e.target.value})} 
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2" 
                                />
                            </div>

                            {passwordError && <p className="text-red-500 text-sm">{passwordError}</p>}

                            <div className="flex justify-end space-x-3 pt-4">
                                <button type="button" onClick={() => setShowPasswordModal(false)} className="px-4 py-2 border rounded text-gray-700 hover:bg-gray-50">Cancelar</button>
                                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500">
                                    Salvar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}
