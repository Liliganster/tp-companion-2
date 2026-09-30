import { useI18n } from '@/hooks/use-i18n';
import type { I18nKey } from '@/lib/i18n';
export function LocalizedText({ messageKey }: { messageKey: I18nKey }) {
  const { t } = useI18n();
  return <>{t(messageKey)}</>;
}
