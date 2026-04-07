import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router.dart';
import '../../../../core/constants/app_spacing.dart';
import '../../../../shared/widgets/feature_page_scaffold.dart';
import '../../../../shared/widgets/panel_card.dart';
import '../providers/my_bets_provider.dart';

class MyBetsPage extends ConsumerWidget {
  const MyBetsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final betsAsync = ref.watch(myBetsListProvider);
    return FeaturePageScaffold(
      title: '我的投注',
      actions: [
        IconButton(
          onPressed: () => ref.invalidate(myBetsListProvider),
          icon: const Icon(Icons.refresh),
        ),
      ],
      children: [
        betsAsync.when(
          data: (payload) => Column(
            children: [
              PanelCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('投注汇总', style: theme.textTheme.titleLarge),
                    const SizedBox(height: AppSpacing.sm),
                    Text(
                      '共 ${payload.summary.totalCount} 条，实付 ${payload.summary.totalNetAmount} 元，奖金 ${payload.summary.totalPrizeAmount} 元',
                      style: theme.textTheme.bodyMedium,
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    Row(
                      children: [
                        Expanded(child: _SummaryMetric(label: '待开奖', value: '${payload.summary.pendingCount}')),
                        const SizedBox(width: AppSpacing.sm),
                        Expanded(child: _SummaryMetric(label: '已结算', value: '${payload.summary.settledCount}')),
                        const SizedBox(width: AppSpacing.sm),
                        Expanded(child: _SummaryMetric(label: '盈亏', value: '${payload.summary.totalNetProfit}')),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.lg),
              ...payload.records.map(
                (record) => Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.md),
                  child: PanelCard(
                    child: ListTile(
                      contentPadding: EdgeInsets.zero,
                      onTap: () => context.push('${AppRoute.myBets.path}/${record.id}'),
                      title: Text('第 ${record.targetPeriod} 期 · ${record.playType}'),
                      subtitle: Text(
                        '${record.frontNumbers.join(' ')}${record.backNumbers.isEmpty ? '' : ' + ${record.backNumbers.join(' ')}'}'
                        '\n实付 ${record.netAmount} 元 · 奖金 ${record.prizeAmount} 元',
                        style: theme.textTheme.bodyMedium,
                      ),
                      isThreeLine: true,
                      trailing: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(record.settlementStatus == 'settled' ? '已结算' : '待开奖'),
                          const SizedBox(height: 4),
                          Text(record.prizeLevel ?? '-', style: theme.textTheme.bodyMedium),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
          loading: () => const Padding(
            padding: EdgeInsets.only(top: AppSpacing.xl),
            child: Center(child: CircularProgressIndicator()),
          ),
          error: (error, stack) => Text('投注记录加载失败：$error', style: theme.textTheme.bodyLarge),
        ),
      ],
    );
  }
}

class _SummaryMetric extends StatelessWidget {
  const _SummaryMetric({
    required this.label,
    required this.value,
  });

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.sm),
      decoration: BoxDecoration(
        color: theme.colorScheme.primary.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: theme.textTheme.bodyMedium),
          const SizedBox(height: 4),
          Text(value, style: theme.textTheme.titleMedium),
        ],
      ),
    );
  }
}
