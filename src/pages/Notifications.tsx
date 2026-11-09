import { Card, PageHeader } from '@/components/ui';
import { NotificationSettings } from '@/features/notifications/NotificationSettings';

/** Tela de ativação das notificações (o card "Avisos" do Início leva para cá). */
export default function Notifications() {
  return (
    <div>
      <PageHeader title="Notificações" back />
      <Card>
        <NotificationSettings />
      </Card>
    </div>
  );
}
