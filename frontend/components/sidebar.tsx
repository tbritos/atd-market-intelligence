'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Globe,
  Store,
  HelpCircle,
  LogOut,
  ExternalLink,
  Users,
  UserCheck,
  Building2
} from 'lucide-react';
import { cn } from '@/lib/utils';

const mainNavItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/grupos', label: 'Grupos', icon: Building2 },
  { href: '/sites', label: 'Sites', icon: Globe },
  { href: '/stores', label: 'Lojas', icon: Store },
  { href: '/clientes', label: 'Clientes', icon: UserCheck },
];

const otherItems = [
  { href: 'http://localhost:3001/admin/queues', label: 'Filas (Bull Board)', icon: ExternalLink, external: true },
  { href: '/ajuda', label: 'Central de Ajuda', icon: HelpCircle },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 flex-shrink-0 flex flex-col border-r border-sidebar-border bg-sidebar">

      {/* Logo */}
      <div className="px-5 py-5">
        <Image
          src="/autoforce-logo.png"
          alt="Autoforce"
          width={140}
          height={18}
          className="object-contain"
          priority
        />
      </div>

      {/* Main nav */}
      <nav className="flex-1 px-3 pb-2">
        <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
          Área Administrativa
        </p>
        <div className="space-y-0.5">
          {mainNavItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150',
                  active
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                )}
              >
                <Icon className={cn('w-4 h-4 flex-shrink-0', active ? 'text-sidebar-primary' : '')} />
                {label}
              </Link>
            );
          })}
        </div>

        {/* Outros */}
        <p className="px-3 mt-5 mb-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
          Outros
        </p>
        <div className="space-y-0.5">
          {otherItems.map(({ href, label, icon: Icon, external }) => {
            const active = pathname === href;
            const props = external
              ? { target: '_blank', rel: 'noopener noreferrer' }
              : {};
            return (
              <Link
                key={href}
                href={href}
                {...props}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150',
                  active
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Footer — Sair */}
      <div className="px-3 py-4 border-t border-sidebar-border">
        <button className="flex w-full items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors duration-150">
          <LogOut className="w-4 h-4 flex-shrink-0" />
          Sair
        </button>
      </div>
    </aside>
  );
}
