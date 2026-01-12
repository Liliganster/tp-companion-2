import { useCallback, useEffect, useMemo, useState } from "react";
import { Receipt, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/use-i18n";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { ExpenseScanButton, ReceiptDocument } from "@/components/expenses/ExpenseScanButton";
import { formatLocaleNumber, parseLocaleNumber } from "@/lib/number";
import { uuidv4 } from "@/lib/utils";
import { logger } from "@/lib/logger";

interface ProjectExpense {
  id: string;
  projectId: string;
  type: "toll" | "parking" | "fuel" | "other";
  amount: number;
  receipts: Array<{
    id: string;
    storagePath: string;
    amount: number | null;
    name: string;
    createdAt: string;
  }>;
  updatedAt: string;
}

interface ProjectExpenseSectionProps {
  projectId: string;
  onExpenseChange?: () => void;
}

export function ProjectExpenseSection({ projectId, onExpenseChange }: ProjectExpenseSectionProps) {
  const { t, locale } = useI18n();
  const [expenses, setExpenses] = useState<ProjectExpense[]>([]);
  const [loading, setLoading] = useState(true);

  // Load expenses from project_expenses table
  const loadExpenses = useCallback(async () => {
    if (!projectId) return;
    
    try {
      const { data, error } = await supabase
        .from("project_expenses")
        .select("*")
        .eq("project_id", projectId);

      if (error) {
        logger.warn("Error loading project expenses", error);
        return;
      }

      setExpenses((data || []).map((e: any) => ({
        id: e.id,
        projectId: e.project_id,
        type: e.expense_type,
        amount: e.amount || 0,
        receipts: e.receipts || [],
        updatedAt: e.updated_at,
      })));
    } catch (err) {
      logger.warn("Error loading project expenses", err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  // Get receipts by type
  const getReceiptsByType = useCallback((type: string): ReceiptDocument[] => {
    const expense = expenses.find(e => e.type === type);
    if (!expense) return [];
    return expense.receipts.map(r => ({
      id: r.id,
      storagePath: r.storagePath,
      amount: r.amount,
      name: r.name,
    }));
  }, [expenses]);

  const tollReceipts = useMemo(() => getReceiptsByType("toll"), [getReceiptsByType]);
  const parkingReceipts = useMemo(() => getReceiptsByType("parking"), [getReceiptsByType]);
  const fuelReceipts = useMemo(() => getReceiptsByType("fuel"), [getReceiptsByType]);
  const otherReceipts = useMemo(() => getReceiptsByType("other"), [getReceiptsByType]);

  // Get total by type
  const getTotalByType = useCallback((type: string): number => {
    const expense = expenses.find(e => e.type === type);
    return expense?.amount || 0;
  }, [expenses]);

  // Save expense to database
  const saveExpense = useCallback(async (type: string, amount: number, receipts: any[]) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No authenticated");

      const existing = expenses.find(e => e.type === type);
      
      if (existing) {
        const { error } = await supabase
          .from("project_expenses")
          .update({
            amount,
            receipts,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("project_expenses")
          .insert({
            id: uuidv4(),
            project_id: projectId,
            user_id: user.id,
            expense_type: type,
            amount,
            receipts,
          });

        if (error) throw error;
      }

      await loadExpenses();
      onExpenseChange?.();
    } catch (err) {
      logger.warn("Error saving project expense", err);
      toast.error(t("projectExpenses.saveError"));
    }
  }, [expenses, loadExpenses, onExpenseChange, projectId, t]);

  // Handle receipt extracted
  const handleExtracted = useCallback((type: string, result: any, storagePath: string) => {
    const currentExpense = expenses.find(e => e.type === type);
    const currentAmount = currentExpense?.amount || 0;
    const currentReceipts = currentExpense?.receipts || [];
    
    const newAmount = currentAmount + (result.amount || 0);
    const newReceipt = {
      id: uuidv4(),
      storagePath,
      amount: result.amount,
      name: `${type}_receipt_${Date.now()}.webp`,
      createdAt: new Date().toISOString(),
    };
    
    saveExpense(type, newAmount, [...currentReceipts, newReceipt]);
  }, [expenses, saveExpense]);

  // Handle receipt deleted
  const handleReceiptDeleted = useCallback((type: string, receiptId: string) => {
    const currentExpense = expenses.find(e => e.type === type);
    if (!currentExpense) return;

    const receipt = currentExpense.receipts.find(r => r.id === receiptId);
    const newAmount = Math.max(0, currentExpense.amount - (receipt?.amount || 0));
    const newReceipts = currentExpense.receipts.filter(r => r.id !== receiptId);
    
    saveExpense(type, newAmount, newReceipts);
  }, [expenses, saveExpense]);

  // Render expense row
  const renderExpenseRow = (
    type: "toll" | "parking" | "fuel" | "other",
    label: string,
    receipts: ReceiptDocument[]
  ) => {
    const total = getTotalByType(type);
    
    return (
      <div key={type} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Receipt className="w-4 h-4 text-primary shrink-0" />
          <span className="text-sm font-medium">{label}</span>
          {total > 0 && (
            <span className="text-sm text-muted-foreground">
              {formatLocaleNumber(total)} €
            </span>
          )}
          {receipts.length > 0 && (
            <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">
              {receipts.length} {receipts.length === 1 ? t("expenses.receipt") : t("expenses.receipts")}
            </span>
          )}
        </div>
        <ExpenseScanButton
          expenseType={type}
          projectId={projectId}
          existingReceipts={receipts}
          onExtracted={(result, storagePath) => handleExtracted(type, result, storagePath)}
          onReceiptDeleted={(receiptId) => handleReceiptDeleted(type, receiptId)}
        />
      </div>
    );
  };

  if (loading) {
    return (
      <div className="glass-card p-4">
        <div className="flex items-center gap-2 mb-4">
          <Receipt className="w-5 h-5 text-muted-foreground" />
          <h3 className="font-medium">{t("projectExpenses.title")}</h3>
        </div>
        <div className="text-sm text-muted-foreground text-center py-4">
          Loading...
        </div>
      </div>
    );
  }

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Receipt className="w-5 h-5 text-muted-foreground" />
          <h3 className="font-medium">{t("projectExpenses.title")}</h3>
        </div>
        {totalExpenses > 0 && (
          <span className="text-sm font-medium text-primary">
            {t("projectExpenses.total")}: {formatLocaleNumber(totalExpenses)} €
          </span>
        )}
      </div>
      
      <p className="text-xs text-muted-foreground mb-4">
        {t("projectExpenses.description")}
      </p>

      <div className="space-y-2">
        {renderExpenseRow("toll", t("tripModal.toll").replace(" (€)", ""), tollReceipts)}
        {renderExpenseRow("parking", t("tripModal.parking").replace(" (€)", ""), parkingReceipts)}
        {renderExpenseRow("fuel", t("tripModal.fuel").replace(" (€)", ""), fuelReceipts)}
        {renderExpenseRow("other", t("tripModal.otherExpenses").replace(" (€)", ""), otherReceipts)}
      </div>
    </div>
  );
}
