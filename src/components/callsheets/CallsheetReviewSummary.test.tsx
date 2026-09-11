import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { CallsheetReviewSummary } from './CallsheetReviewSummary';
vi.mock('@/hooks/use-i18n',()=>({useI18n:()=>({t:(key:string)=>key})}));
it('shows a stored partial date and ordered addresses with details closed',()=>{
 render(<CallsheetReviewSummary job={{id:'job',status:'needs_review',storage_path:'file.pdf',created_at:'2026-09-11',
  needs_review_reason:'Full repetitive explanation '.repeat(30),
  callsheet_results:{date_value:null,date_evidence:'Tuesday, 19th Nov'},
  callsheet_locations:[{position:1,label_source:'Hotel',formatted_address:'Second Road 2',review_reason:'https://maps.app.goo.gl/example A very long explanation '.repeat(20)},
   {position:0,label_source:'SET',formatted_address:'First Road 1',selection_state:'confirmed'}],
 }} />);
 expect(screen.getByText('Tuesday, 19th Nov')).toBeVisible();
 expect(screen.getByText('callsheetReview.incompleteDate')).toBeVisible();
 expect(screen.queryByText(/Full repetitive explanation/)).not.toBeInTheDocument();
 expect(screen.getByText('1. First Road 1')).toBeVisible();
 expect(screen.getByText('2. Second Road 2')).toBeVisible();
 expect(screen.getByText('callsheetReview.details').closest('details')).not.toHaveAttribute('open');
 expect(document.body.textContent).not.toContain('maps.app.goo.gl');
});
