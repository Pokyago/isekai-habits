import { useMemo, useState } from 'react';
import { BarChart } from '../../components/BarChart';
import { CHART_COLORS, LineChart } from '../../components/LineChart';
import { Empty, Panel, Segmented, inputBase } from '../../components/ui';
import { formatLong } from '../../game/dates';
import { categoryName } from '../../money/categories';
import { formatMonth, formatMonthShort, formatWhole } from '../../money/format';
import { balanceSeries, categoryByMonth, categoryTotals, lastMonths, monthlyFlows } from '../../money/trends';
import { Stats, useMoney } from './forms';

type Span = '6' | '12' | '24';
const SPANS: { value: Span; label: string }[] = [
  { value: '6', label: '6 months' },
  { value: '12', label: '12 months' },
  { value: '24', label: '2 years' },
];

/** Room on the left of each chart for amounts like "R$ 12.000". */
const AXIS = 78;

export function Charts() {
  const { data, today, currency, fmt } = useMoney();
  const [span, setSpan] = useState<Span>('12');
  const [picked, setPicked] = useState<string | null>(null);

  const months = useMemo(() => lastMonths(today, Number(span)), [today, span]);
  const flows = useMemo(() => monthlyFlows(data, months), [data, months]);
  const balance = useMemo(() => balanceSeries(data, `${months[0]}-01`, today), [data, months, today]);
  const categories = useMemo(() => categoryTotals(data, months), [data, months]);
  const category = picked && categories.some((c) => c.category === picked) ? picked : (categories[0]?.category ?? null);
  const byMonth = useMemo(() => (category ? categoryByMonth(data, category, months) : []), [data, category, months]);

  const labels = months.map((m) => ({ key: m, short: formatMonthShort(m), long: formatMonth(m) }));
  // Charts work in whole currency units; amounts are stored in cents.
  const tick = (units: number) => formatWhole(units * 100, currency);
  const exact = (units: number) => fmt(Math.round(units * 100));

  // Averages over the months that actually have entries, so empty months don't drag them down.
  const used = flows.filter((f) => f.income > 0 || f.out > 0);
  const average = (pick: (f: (typeof flows)[number]) => number) =>
    used.length === 0 ? 0 : Math.round(used.reduce((n, f) => n + pick(f), 0) / used.length);
  const kept = average((f) => f.income - f.out);
  const usedInCategory = byMonth.filter((v) => v > 0);

  if (used.length === 0 && balance.length <= 1) {
    return (
      <Panel>
        <Empty>Charts appear here once you have some entries. Add a few, or import a bank statement.</Empty>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <div className="max-w-md">
        <Segmented<Span> label="Period" value={span} onChange={setSpan} options={SPANS} />
      </div>

      <Stats
        tone="panel"
        items={[
          ['In, average month', fmt(average((f) => f.income)), 'var(--stat-vit)'],
          ['Out, average month', fmt(average((f) => f.out))],
          ['Left over, average month', `${kept < 0 ? '−' : '+'}${fmt(Math.abs(kept))}`, kept < 0 ? 'var(--color-danger)' : 'var(--stat-vit)'],
        ]}
      />

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <Panel title="Bank balance">
          {balance.length < 2 ? (
            <Empty>
              {balance.length === 1
                ? `The line starts today at ${fmt(balance[0].amount)}. It grows as the days go by.`
                : 'No balance in this period.'}
            </Empty>
          ) : (
            <LineChart
              series={[{ name: 'Balance', color: CHART_COLORS[0], points: balance.map((p) => ({ date: p.date, value: p.amount / 100 })) }]}
              unit=""
              decimals={0}
              format={tick}
              formatValue={exact}
              axisWidth={AXIS}
              height={260}
              label="Bank balance over time"
            />
          )}
          <p className="mt-2 text-xs text-mute">
            The balance is known from {formatLong(data.money!.openingDate)}, the day you set up money tracking. Earlier
            entries appear in the monthly charts only.
          </p>
        </Panel>

        <Panel title="Money in and out, by month">
          <BarChart
            categories={labels}
            series={[
              { name: 'In', color: CHART_COLORS[0], values: flows.map((f) => f.income / 100) },
              { name: 'Out', color: CHART_COLORS[1], values: flows.map((f) => f.out / 100) },
            ]}
            format={tick}
            formatValue={exact}
            axisWidth={AXIS}
            height={260}
            label="Money in and money out for each month"
          />
          <p className="mt-2 text-xs text-mute">“Out” is everything that left the account, including debt payments and savings.</p>
        </Panel>

        <Panel
          title="One category, by month"
          className="xl:col-span-2"
          right={
            categories.length > 0 ? (
              <select
                className={`${inputBase} -my-1 min-h-8 w-44 shrink-0 py-0 text-xs`}
                value={category ?? ''}
                onChange={(e) => setPicked(e.target.value)}
                aria-label="Category to chart"
              >
                {categories.map((c) => (
                  <option key={c.category} value={c.category}>
                    {categoryName(c.category)}
                  </option>
                ))}
              </select>
            ) : undefined
          }
        >
          {category === null ? (
            <Empty>Nothing was spent in this period.</Empty>
          ) : (
            <>
              <BarChart
                categories={labels}
                series={[{ name: categoryName(category), color: CHART_COLORS[0], values: byMonth.map((v) => v / 100) }]}
                format={tick}
                formatValue={exact}
                axisWidth={AXIS}
                height={240}
                label={`${categoryName(category)} spending for each month`}
              />
              <p className="mt-2 text-xs text-mute">
                {categoryName(category)}: {fmt(byMonth.reduce((n, v) => n + v, 0))} in this period
                {usedInCategory.length > 0 &&
                  `, about ${fmt(Math.round(usedInCategory.reduce((n, v) => n + v, 0) / usedInCategory.length))} in a month that has any`}
                .
              </p>
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}
