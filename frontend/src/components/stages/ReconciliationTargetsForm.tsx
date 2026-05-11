import type { JSX, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";

const ENTITY_TYPES = [
    "Individual",
    "Corporation",
    "S Corporation",
    "Partnership",
    "Fiduciary (Trust/Estate)",
    "Non-Profit",
    "LLC",
    "Government",
    "Other",
] as const;

const SERVICE_TYPES = [
    "Tax Preparation",
    "Tax Planning / Advisory",
    "Audit & Assurance",
    "Review & Compilation",
    "Bookkeeping / Write-Up",
    "CAS (Client Accounting Services)",
    "Payroll",
    "Consulting / Advisory",
    "Wealth Management",
    "Other",
] as const;

const AGING_BUCKETS = [
    { key: "current", label: "Current (0-30 days)" },
    { key: "d31_60", label: "31-60 days" },
    { key: "d61_90", label: "61-90 days" },
    { key: "d91_120", label: "91-120 days" },
    { key: "d121_plus", label: "121+ days" },
] as const;

const QUARTERS = [
    { key: "q1", label: "Q1 (Jan-Mar)" },
    { key: "q2", label: "Q2 (Apr-Jun)" },
    { key: "q3", label: "Q3 (Jul-Sep)" },
    { key: "q4", label: "Q4 (Oct-Dec)" },
] as const;

const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
] as const;

type FormValues = Record<string, string>;
type ValidationState = boolean | null;
type RevenueGranularity = "quarterly" | "monthly";
type HoldWithARValue = "unknown" | "yes" | "no";

interface ReconciliationTargetsFormProps {
    initialValues: Record<string, string>;
    onSave: (values: Record<string, string>) => void;
    onClose: () => void;
}

interface SectionHeaderProps {
    number: string;
    title: string;
    subtitle?: string;
}

interface FieldProps {
    label: string;
    hint?: string;
    error?: string;
    children: ReactNode;
}

interface CurrencyInputProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
}

interface NumberInputProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
}

interface TextInputProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    type?: "text" | "date";
}

interface ValidationBadgeProps {
    pass: boolean;
    label: string;
}

const buildInitialValues = (): FormValues => ({
    firmName: "",
    sourceSystem: "",
    cutoffDate: "",
    reportDate: "",
    preparedBy: "",
    notes: "",
    clientsActive: "",
    clientsInactive: "",
    clientsOnHold: "",
    clientsProspect: "",
    arTotalBalance: "",
    arOpenInvoiceCount: "",
    arCreditsOutstanding: "",
    wipTotalBalance: "",
    wipTotalHours: "",
    wipEntryCount: "",
    revenueGranularity: "quarterly",
    revenueAnnualTotal: "",
    staffTotal: "",
    staffPartners: "",
    officeCount: "",
    fyeDecemberPct: "",
    hasOnHoldWithAR: "unknown",
    ...Object.fromEntries(AGING_BUCKETS.map((bucket) => [`aging.${bucket.key}`, ""])),
    ...Object.fromEntries(QUARTERS.map((quarter) => [`revenueQuarterly.${quarter.key}`, ""])),
    ...Object.fromEntries(MONTHS.map((_, index) => [`revenueMonthly.${String(index)}`, ""])),
    ...Object.fromEntries(ENTITY_TYPES.map((entity) => [`entityCounts.${entity}`, ""])),
    ...Object.fromEntries(SERVICE_TYPES.map((service) => [`serviceCounts.${service}`, ""])),
});

const parseNumber = (value: string | undefined): number => {
    const parsed = Number.parseFloat(value ?? "");
    return Number.isNaN(parsed) ? 0 : parsed;
};

const formatCurrency = (value: string | number): string => {
    const parsed = typeof value === "number" ? value : Number.parseFloat(value);

    if (Number.isNaN(parsed)) {
        return "--";
    }

    return parsed.toLocaleString("en-US", { style: "currency", currency: "USD" });
};

const SectionHeader = ({ number, title, subtitle }: SectionHeaderProps): JSX.Element => (
    <div className="mb-4 mt-8 first:mt-0">
        <div className="flex items-baseline gap-3">
            <span className="inline-flex h-7 w-7 min-w-7 items-center justify-center rounded-full bg-teal-600 text-xs font-semibold text-white">
                {number}
            </span>
            <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
        </div>
        {subtitle ? <p className="ml-10 mt-1 text-sm text-slate-500">{subtitle}</p> : null}
        <div className="mt-3 border-b border-slate-200" />
    </div>
);

const Field = ({ label, hint, error, children }: FieldProps): JSX.Element => (
    <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-slate-700">{label}</label>
        {children}
        {hint && !error ? <span className="text-xs text-slate-400">{hint}</span> : null}
        {error ? <span className="text-xs font-medium text-red-500">{error}</span> : null}
    </div>
);

const CurrencyInput = ({ value, onChange, placeholder }: CurrencyInputProps): JSX.Element => (
    <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
        <Input
            type="text"
            inputMode="decimal"
            value={value}
            onChange={(event) => onChange(event.target.value.replace(/[^0-9.\-]/g, ""))}
            placeholder={placeholder ?? "0.00"}
            className="border-slate-300 bg-white pl-7 pr-3 text-slate-800 focus-visible:ring-teal-500"
        />
    </div>
);

const NumberInput = ({ value, onChange, placeholder }: NumberInputProps): JSX.Element => (
    <Input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/[^0-9]/g, ""))}
        placeholder={placeholder ?? "0"}
        className="border-slate-300 bg-white text-slate-800 focus-visible:ring-teal-500"
    />
);

const TextInput = ({ value, onChange, placeholder, type = "text" }: TextInputProps): JSX.Element => (
    <Input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="border-slate-300 bg-white text-slate-800 focus-visible:ring-teal-500"
    />
);

const ValidationBadge = ({ pass, label }: ValidationBadgeProps): JSX.Element => (
    <div
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${pass ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-600"
            }`}
    >
        <span>{pass ? "✓" : "✗"}</span>
        <span>{label}</span>
    </div>
);

export const ReconciliationTargetsForm = ({ initialValues, onSave, onClose }: ReconciliationTargetsFormProps): JSX.Element => {
    const [form, setForm] = useState<FormValues>(() => ({ ...buildInitialValues(), ...initialValues }));
    const [copyStatus, setCopyStatus] = useState<"idle" | "success" | "error">("idle");

    useEffect(() => {
        setForm({ ...buildInitialValues(), ...initialValues });
        setCopyStatus("idle");
    }, [initialValues]);

    const setValue = useCallback((path: string, value: string): void => {
        setForm((current) => ({
            ...current,
            [path]: value,
        }));
        setCopyStatus("idle");
    }, []);

    const revenueGranularity: RevenueGranularity = form.revenueGranularity === "monthly" ? "monthly" : "quarterly";
    const hasOnHoldWithAR: HoldWithARValue = form.hasOnHoldWithAR === "yes" || form.hasOnHoldWithAR === "no" ? form.hasOnHoldWithAR : "unknown";

    const validations = useMemo(() => {
        const agingSum = AGING_BUCKETS.reduce((sum, bucket) => sum + parseNumber(form[`aging.${bucket.key}`]), 0);
        const arTotal = parseNumber(form.arTotalBalance);
        const agingMatchesAR: ValidationState = arTotal !== 0 && agingSum !== 0 ? Math.abs(agingSum - arTotal) < 0.02 : null;

        const revenuePeriods = revenueGranularity === "quarterly"
            ? QUARTERS.reduce((sum, quarter) => sum + parseNumber(form[`revenueQuarterly.${quarter.key}`]), 0)
            : MONTHS.reduce((sum, _, index) => sum + parseNumber(form[`revenueMonthly.${String(index)}`]), 0);
        const revenueAnnual = parseNumber(form.revenueAnnualTotal);
        const revenueMatches: ValidationState = revenueAnnual !== 0 && revenuePeriods !== 0 ? Math.abs(revenuePeriods - revenueAnnual) < 0.02 : null;

        const clientSum = parseNumber(form.clientsActive)
            + parseNumber(form.clientsInactive)
            + parseNumber(form.clientsOnHold)
            + parseNumber(form.clientsProspect);

        const entitySum = ENTITY_TYPES.reduce((sum, entity) => sum + parseNumber(form[`entityCounts.${entity}`]), 0);
        const entityMatchesClients: ValidationState = clientSum > 0 && entitySum > 0 ? entitySum === clientSum : null;

        return {
            agingSum,
            agingMatchesAR,
            revenuePeriods,
            revenueMatches,
            clientSum,
            entitySum,
            entityMatchesClients,
        };
    }, [form, revenueGranularity]);

    const handleExport = useCallback(async (): Promise<void> => {
        const payload = {
            meta: {
                firmName: form.firmName,
                sourceSystem: form.sourceSystem,
                cutoffDate: form.cutoffDate,
                reportDate: form.reportDate,
                preparedBy: form.preparedBy,
                notes: form.notes,
                exportedAt: new Date().toISOString(),
            },
            clients: {
                active: parseNumber(form.clientsActive),
                inactive: parseNumber(form.clientsInactive),
                onHold: parseNumber(form.clientsOnHold),
                prospect: parseNumber(form.clientsProspect),
                total: validations.clientSum,
            },
            accountsReceivable: {
                totalBalance: parseNumber(form.arTotalBalance),
                openInvoiceCount: parseNumber(form.arOpenInvoiceCount),
                creditsOutstanding: parseNumber(form.arCreditsOutstanding),
                aging: Object.fromEntries(AGING_BUCKETS.map((bucket) => [bucket.key, parseNumber(form[`aging.${bucket.key}`])])),
                agingSumCheck: validations.agingSum,
            },
            workInProgress: {
                totalBalance: parseNumber(form.wipTotalBalance),
                totalHours: parseNumber(form.wipTotalHours),
                entryCount: parseNumber(form.wipEntryCount),
            },
            revenue: {
                granularity: revenueGranularity,
                periods: revenueGranularity === "quarterly"
                    ? Object.fromEntries(QUARTERS.map((quarter) => [quarter.key, parseNumber(form[`revenueQuarterly.${quarter.key}`])]))
                    : Object.fromEntries(MONTHS.map((month, index) => [month, parseNumber(form[`revenueMonthly.${String(index)}`])])),
                annualTotal: parseNumber(form.revenueAnnualTotal),
                periodsSumCheck: validations.revenuePeriods,
            },
            staff: {
                total: parseNumber(form.staffTotal),
                partners: parseNumber(form.staffPartners),
                offices: parseNumber(form.officeCount),
            },
            entityMix: Object.fromEntries(
                ENTITY_TYPES.filter((entity) => parseNumber(form[`entityCounts.${entity}`]) > 0)
                    .map((entity) => [entity, parseNumber(form[`entityCounts.${entity}`])]),
            ),
            serviceMix: Object.fromEntries(
                SERVICE_TYPES.filter((service) => parseNumber(form[`serviceCounts.${service}`]) > 0)
                    .map((service) => [service, parseNumber(form[`serviceCounts.${service}`])]),
            ),
            semanticConfig: {
                fyeDecemberPct: parseNumber(form.fyeDecemberPct),
                hasOnHoldWithAR,
            },
            crossValidations: {
                agingMatchesAR: validations.agingMatchesAR,
                revenuePeriodsMatchAnnual: validations.revenueMatches,
                entityCountMatchesClientCount: validations.entityMatchesClients,
            },
        };

        if (!navigator.clipboard) {
            setCopyStatus("error");
            return;
        }

        try {
            await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
            setCopyStatus("success");
        } catch {
            setCopyStatus("error");
        }
    }, [form, hasOnHoldWithAR, revenueGranularity, validations]);

    return (
        <div className="flex h-full flex-col overflow-hidden bg-slate-50">
            <div className="bg-[linear-gradient(135deg,#1a2744_0%,#0d3b3b_100%)] px-6 py-5">
                <div className="mx-auto max-w-5xl">
                    <h1 className="text-xl font-bold tracking-tight text-white">Reconciliation Targets</h1>
                    <p className="mt-1 text-sm text-teal-300">Project Migrate - Test-Driven Validation</p>
                    <p className="mt-2 max-w-2xl text-xs leading-relaxed text-slate-300">
                        Provide these numbers from your source system&apos;s standard reports. The migration bot uses them as pass/fail
                        acceptance criteria and reworks generated SQL until the output reconciles to these targets.
                    </p>
                </div>
            </div>

            <ScrollArea className="min-h-0 flex-1">
                <div className="mx-auto max-w-5xl px-6 py-6">
                    <SectionHeader
                        number="1"
                        title="Migration Context"
                        subtitle="Identify the firm and the point-in-time these numbers represent."
                    />
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <Field label="Firm Name">
                            <TextInput value={form.firmName} onChange={(value) => setValue("firmName", value)} placeholder="Sweeney Conrad" />
                        </Field>
                        <Field label="Source System">
                            <TextInput value={form.sourceSystem} onChange={(value) => setValue("sourceSystem", value)} placeholder="Practice Engine" />
                        </Field>
                        <Field label="Migration Cutoff Date" hint="No transactions after this date migrate.">
                            <TextInput type="date" value={form.cutoffDate} onChange={(value) => setValue("cutoffDate", value)} />
                        </Field>
                        <Field label="Report Date" hint="When these numbers were pulled.">
                            <TextInput type="date" value={form.reportDate} onChange={(value) => setValue("reportDate", value)} />
                        </Field>
                        <Field label="Prepared By">
                            <TextInput value={form.preparedBy} onChange={(value) => setValue("preparedBy", value)} placeholder="Name / role" />
                        </Field>
                    </div>

                    <SectionHeader
                        number="2"
                        title="Client Population"
                        subtitle="Count of clients by status. Source: client list or client status report."
                    />
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <Field label="Active Clients">
                            <NumberInput value={form.clientsActive} onChange={(value) => setValue("clientsActive", value)} />
                        </Field>
                        <Field label="Inactive Clients">
                            <NumberInput value={form.clientsInactive} onChange={(value) => setValue("clientsInactive", value)} />
                        </Field>
                        <Field label="On Hold Clients" hint="Inactive but with outstanding AR balance.">
                            <NumberInput value={form.clientsOnHold} onChange={(value) => setValue("clientsOnHold", value)} />
                        </Field>
                        <Field label="Prospect / Non-Billable" hint="Excluded from migration unless specified.">
                            <NumberInput value={form.clientsProspect} onChange={(value) => setValue("clientsProspect", value)} />
                        </Field>
                    </div>
                    {validations.clientSum > 0 ? (
                        <div className="mt-3 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600">
                            Total client population: <span className="font-semibold">{validations.clientSum.toLocaleString()}</span>
                        </div>
                    ) : null}

                    <SectionHeader
                        number="3"
                        title="Accounts Receivable"
                        subtitle="Source: AR aging summary report as of cutoff date."
                    />
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <Field label="Total AR Outstanding Balance" hint="Open invoices minus payments, credits, and write-offs.">
                            <CurrencyInput value={form.arTotalBalance} onChange={(value) => setValue("arTotalBalance", value)} />
                        </Field>
                        <Field label="Number of Open Invoices">
                            <NumberInput value={form.arOpenInvoiceCount} onChange={(value) => setValue("arOpenInvoiceCount", value)} />
                        </Field>
                        <Field label="Outstanding Credits / Write-offs" hint="Net credit balance, if any.">
                            <CurrencyInput value={form.arCreditsOutstanding} onChange={(value) => setValue("arCreditsOutstanding", value)} />
                        </Field>
                    </div>

                    <h3 className="mb-3 mt-5 text-sm font-semibold text-slate-700">AR Aging Buckets</h3>
                    <div className="grid gap-3 md:grid-cols-5">
                        {AGING_BUCKETS.map((bucket) => (
                            <Field key={bucket.key} label={bucket.label}>
                                <CurrencyInput value={form[`aging.${bucket.key}`]} onChange={(value) => setValue(`aging.${bucket.key}`, value)} />
                            </Field>
                        ))}
                    </div>
                    {validations.agingMatchesAR !== null ? (
                        <div className="mt-3 flex items-center gap-3">
                            <ValidationBadge
                                pass={validations.agingMatchesAR}
                                label={validations.agingMatchesAR
                                    ? "Aging buckets sum to AR total"
                                    : `Aging sum ${formatCurrency(validations.agingSum)} != AR total ${formatCurrency(form.arTotalBalance)}`}
                            />
                        </div>
                    ) : null}

                    <SectionHeader
                        number="4"
                        title="Work in Progress (WIP)"
                        subtitle="Source: WIP summary or unbilled time report as of cutoff date."
                    />
                    <div className="mt-4 grid gap-4 md:grid-cols-3">
                        <Field label="Total WIP Balance" hint="Unbilled fees at standard rates.">
                            <CurrencyInput value={form.wipTotalBalance} onChange={(value) => setValue("wipTotalBalance", value)} />
                        </Field>
                        <Field label="Total WIP Hours">
                            <NumberInput value={form.wipTotalHours} onChange={(value) => setValue("wipTotalHours", value)} />
                        </Field>
                        <Field label="WIP Entry Count" hint="Number of individual time entries.">
                            <NumberInput value={form.wipEntryCount} onChange={(value) => setValue("wipEntryCount", value)} />
                        </Field>
                    </div>

                    <SectionHeader
                        number="5"
                        title="Revenue by Period"
                        subtitle="Source: revenue summary or billing report for the 12 months ending at cutoff."
                    />
                    <div className="mb-4 mt-4 flex items-center gap-4">
                        <span className="text-sm text-slate-600">Report by:</span>
                        <button
                            type="button"
                            onClick={() => setValue("revenueGranularity", "quarterly")}
                            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${revenueGranularity === "quarterly" ? "bg-teal-600 text-white" : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                                }`}
                        >
                            Quarterly
                        </button>
                        <button
                            type="button"
                            onClick={() => setValue("revenueGranularity", "monthly")}
                            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${revenueGranularity === "monthly" ? "bg-teal-600 text-white" : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                                }`}
                        >
                            Monthly
                        </button>
                    </div>

                    {revenueGranularity === "quarterly" ? (
                        <div className="grid gap-3 md:grid-cols-4">
                            {QUARTERS.map((quarter) => (
                                <Field key={quarter.key} label={quarter.label}>
                                    <CurrencyInput
                                        value={form[`revenueQuarterly.${quarter.key}`]}
                                        onChange={(value) => setValue(`revenueQuarterly.${quarter.key}`, value)}
                                    />
                                </Field>
                            ))}
                        </div>
                    ) : (
                        <div className="grid gap-3 md:grid-cols-4">
                            {MONTHS.map((month, index) => (
                                <Field key={month} label={month}>
                                    <CurrencyInput
                                        value={form[`revenueMonthly.${String(index)}`]}
                                        onChange={(value) => setValue(`revenueMonthly.${String(index)}`, value)}
                                    />
                                </Field>
                            ))}
                        </div>
                    )}

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <Field
                            label="Annual Revenue Total"
                            hint="Cross-check: should equal sum of periods above."
                            error={validations.revenueMatches === false ? `Period sum ${formatCurrency(validations.revenuePeriods)} != annual total` : undefined}
                        >
                            <CurrencyInput value={form.revenueAnnualTotal} onChange={(value) => setValue("revenueAnnualTotal", value)} />
                        </Field>
                    </div>
                    {validations.revenueMatches !== null ? (
                        <div className="mt-3">
                            <ValidationBadge
                                pass={validations.revenueMatches}
                                label={validations.revenueMatches
                                    ? "Period totals match annual revenue"
                                    : "Period totals do not match. Check rounding or missing periods."}
                            />
                        </div>
                    ) : null}

                    <SectionHeader
                        number="6"
                        title="Staff & Offices"
                        subtitle="Source: staff list and office directory."
                    />
                    <div className="mt-4 grid gap-4 md:grid-cols-3">
                        <Field label="Total Staff" hint="All active employees.">
                            <NumberInput value={form.staffTotal} onChange={(value) => setValue("staffTotal", value)} />
                        </Field>
                        <Field label="Partners / Principals">
                            <NumberInput value={form.staffPartners} onChange={(value) => setValue("staffPartners", value)} />
                        </Field>
                        <Field label="Number of Offices">
                            <NumberInput value={form.officeCount} onChange={(value) => setValue("officeCount", value)} />
                        </Field>
                    </div>

                    <SectionHeader
                        number="7"
                        title="Client Entity Mix"
                        subtitle="Count of clients by entity type. Source: client list grouped by entity type."
                    />
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                        {ENTITY_TYPES.map((entity) => (
                            <Field key={entity} label={entity}>
                                <NumberInput value={form[`entityCounts.${entity}`]} onChange={(value) => setValue(`entityCounts.${entity}`, value)} />
                            </Field>
                        ))}
                    </div>
                    {validations.entityMatchesClients !== null ? (
                        <div className="mt-3">
                            <ValidationBadge
                                pass={validations.entityMatchesClients}
                                label={validations.entityMatchesClients
                                    ? `Entity sum (${validations.entitySum}) matches client total`
                                    : `Entity sum ${validations.entitySum} != client total ${validations.clientSum}`}
                            />
                        </div>
                    ) : null}

                    <SectionHeader
                        number="8"
                        title="Service Mix (Optional)"
                        subtitle="Count of clients by primary service type. Helps validate service code mappings."
                    />
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                        {SERVICE_TYPES.map((service) => (
                            <Field key={service} label={service}>
                                <NumberInput value={form[`serviceCounts.${service}`]} onChange={(value) => setValue(`serviceCounts.${service}`, value)} />
                            </Field>
                        ))}
                    </div>

                    <SectionHeader
                        number="9"
                        title="Semantic Validation Config"
                        subtitle="Expected data patterns. Used for sanity checks, not hard pass/fail."
                    />
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <Field label="% of Clients with December FYE" hint="Most US firms: 70-90%. Helps catch date-mapping errors.">
                            <div className="relative">
                                <Input
                                    type="text"
                                    inputMode="numeric"
                                    value={form.fyeDecemberPct}
                                    onChange={(event) => setValue("fyeDecemberPct", event.target.value.replace(/[^0-9]/g, ""))}
                                    placeholder="75"
                                    className="border-slate-300 bg-white pr-7 text-slate-800 focus-visible:ring-teal-500"
                                />
                                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span>
                            </div>
                        </Field>
                        <Field label="Inactive clients with AR balance?" hint="Should these be 'On Hold' vs 'Inactive' in CCH?">
                            <select
                                value={hasOnHoldWithAR}
                                onChange={(event) => setValue("hasOnHoldWithAR", event.target.value)}
                                className="flex h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-teal-500"
                            >
                                <option value="unknown">Not sure</option>
                                <option value="yes">Yes - some inactive clients have AR</option>
                                <option value="no">No - all inactive clients have zero AR</option>
                            </select>
                        </Field>
                    </div>

                    <div className="mt-6">
                        <Field
                            label="Additional Notes"
                            hint="Known data quality issues, exclusions, or special handling instructions."
                        >
                            <Textarea
                                value={form.notes}
                                onChange={(event) => setValue("notes", event.target.value)}
                                rows={3}
                                placeholder="e.g., Exclude client codes starting with 99 because they are internal or test records."
                                className="border-slate-300 bg-white text-slate-800 focus-visible:ring-teal-500"
                            />
                        </Field>
                    </div>

                    <div className="mt-8 rounded-lg border border-slate-200 bg-slate-100 p-4">
                        <h3 className="mb-3 text-sm font-semibold text-slate-700">Cross-Validation Summary</h3>
                        <div className="flex flex-wrap gap-2">
                            {validations.agingMatchesAR !== null ? <ValidationBadge pass={validations.agingMatchesAR} label="Aging -> AR total" /> : null}
                            {validations.revenueMatches !== null ? <ValidationBadge pass={validations.revenueMatches} label="Periods -> annual revenue" /> : null}
                            {validations.entityMatchesClients !== null ? <ValidationBadge pass={validations.entityMatchesClients} label="Entity mix -> client total" /> : null}
                            {validations.agingMatchesAR === null && validations.revenueMatches === null && validations.entityMatchesClients === null ? (
                                <span className="text-xs text-slate-400">Fill in values to see cross-validation checks.</span>
                            ) : null}
                        </div>
                    </div>
                </div>
            </ScrollArea>

            <div className="flex shrink-0 items-center justify-between gap-4 border-t border-slate-200 bg-white px-6 py-4">
                <div className="text-sm text-slate-500">
                    {copyStatus === "success" ? <span className="font-medium text-emerald-600">JSON copied to clipboard.</span> : null}
                    {copyStatus === "error" ? <span className="font-medium text-red-600">Clipboard export failed in this browser context.</span> : null}
                </div>
                <div className="flex items-center gap-3">
                    <Button variant="outline" onClick={onClose}>Close</Button>
                    <Button variant="outline" onClick={() => void handleExport()}>Export JSON</Button>
                    <Button onClick={() => onSave(form)}>Save Targets</Button>
                </div>
            </div>
        </div>
    );
};