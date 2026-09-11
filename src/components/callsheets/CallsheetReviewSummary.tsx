import { useI18n } from '@/hooks/use-i18n';
import { compactCallsheetReviewReason, type ReviewCallsheetJob } from '@/lib/callsheetReview';

export function CallsheetReviewSummary({ job }: { job: ReviewCallsheetJob }) {
  const { t } = useI18n();
  const result = job.callsheet_results;
  const date = result?.date_value || result?.date_evidence;
  const locations = [...(job.callsheet_locations ?? [])].sort((a,b) => (a.position ?? 0) - (b.position ?? 0));
  const reason = !result?.date_value && date
    ? t('callsheetReview.incompleteDate')
    : compactCallsheetReviewReason(job.needs_review_reason) || t('callsheetReview.checkData');
  return <div className="space-y-1 text-sm">
    {date && <p>{t('callsheetReview.detectedDate')}: <span className="font-medium">{date}</span></p>}
    <p className="text-muted-foreground">{reason}</p>
    <ol className="space-y-1">
      {locations.map((location,index) => <li key={index} className="break-words">
        {locations.length > 1 && `${index + 1}. `}{location.formatted_address || location.address_raw}
      </li>)}
    </ol>
    {locations.some(location => location.review_reason || location.label_source) && <details className="text-muted-foreground">
      <summary className="cursor-pointer">{t('callsheetReview.details')}</summary>
      <ul className="mt-2 space-y-1">
        {locations.map((location,index) => <li key={index} className="break-words">
          {location.label_source || `${index + 1}`} — {location.selection_state === 'candidate' ? t('callsheetReview.title') : t('bulk.statusReady')}
          {location.review_reason && `: ${compactCallsheetReviewReason(location.review_reason)}`}
        </li>)}
      </ul>
    </details>}
  </div>;
}
