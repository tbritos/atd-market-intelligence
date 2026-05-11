import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string | number | null;
  subtitle?: string;
  icon: LucideIcon;
  iconColor?: string;
  loading?: boolean;
}

export function StatCard({ title, value, subtitle, icon: Icon, iconColor, loading }: StatCardProps) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
            {loading ? (
              <Skeleton className="h-8 w-24 mt-2" />
            ) : (
              <p className="text-2xl font-bold text-foreground mt-1">
                {value ?? '—'}
              </p>
            )}
            {subtitle && !loading && (
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            )}
          </div>
          <div className={cn('p-2 rounded-lg bg-primary/10', iconColor)}>
            <Icon className="w-5 h-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
