import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/constants/app_spacing.dart';
import '../../../../shared/models/lottery_code.dart';
import '../../../../shared/widgets/feature_page_scaffold.dart';
import '../../../../shared/widgets/panel_card.dart';
import '../providers/prediction_overview_provider.dart';

class PredictionHomePage extends ConsumerStatefulWidget {
  const PredictionHomePage({super.key});

  @override
  ConsumerState<PredictionHomePage> createState() => _PredictionHomePageState();
}

class _PredictionHomePageState extends ConsumerState<PredictionHomePage> {
  LotteryCode selectedLottery = LotteryCode.dlt;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final predictionsAsync = ref.watch(currentPredictionsProvider);
    return FeaturePageScaffold(
      title: '今日预测',
      children: [
        PanelCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('移动端首期聚焦“看结果、看趋势、看详情”。', style: theme.textTheme.bodyLarge),
              const SizedBox(height: AppSpacing.lg),
              Wrap(
                spacing: AppSpacing.sm,
                children: LotteryCode.values
                    .map(
                      (lottery) => ChoiceChip(
                        label: Text(lottery.label),
                        selected: selectedLottery == lottery,
                        onSelected: (_) {
                          setState(() => selectedLottery = lottery);
                          ref.read(selectedLotteryCodeProvider.notifier).state = lottery.code;
                        },
                      ),
                    )
                    .toList(),
              ),
              const SizedBox(height: AppSpacing.lg),
              predictionsAsync.when(
                data: (payload) {
                  final totalGroups = payload.models.fold<int>(0, (sum, model) => sum + model.predictions.length);
                  final averageHit = payload.models.isEmpty
                      ? 0
                      : payload.models
                              .map((model) => model.bestHitCount ?? 0)
                              .fold<int>(0, (sum, value) => sum + value) ~/
                          payload.models.length;
                  return Row(
                    children: [
                      _StatBadge(label: '期号', value: payload.targetPeriod),
                      const SizedBox(width: AppSpacing.sm),
                      _StatBadge(label: '优选命中', value: '$averageHit'),
                      const SizedBox(width: AppSpacing.sm),
                      _StatBadge(label: '注单组数', value: '$totalGroups'),
                    ],
                  );
                },
                loading: () => const Padding(
                  padding: EdgeInsets.symmetric(vertical: AppSpacing.sm),
                  child: LinearProgressIndicator(),
                ),
                error: (error, stack) => Text(
                  '摘要加载失败：$error',
                  style: theme.textTheme.bodyMedium,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        PanelCard(
          child: SizedBox(
            height: 180,
            child: LineChart(
              LineChartData(
                gridData: const FlGridData(show: false),
                titlesData: const FlTitlesData(show: false),
                borderData: FlBorderData(show: false),
                lineBarsData: [
                  LineChartBarData(
                    isCurved: true,
                    barWidth: 4,
                    color: theme.colorScheme.primary,
                    spots: const [
                      FlSpot(0, 1.5),
                      FlSpot(1, 2.1),
                      FlSpot(2, 1.9),
                      FlSpot(3, 2.8),
                      FlSpot(4, 3.1),
                      FlSpot(5, 2.7),
                    ],
                    belowBarData: BarAreaData(
                      show: true,
                      color: theme.colorScheme.primary.withValues(alpha: 0.18),
                    ),
                    dotData: const FlDotData(show: false),
                  ),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        Text('推荐模型', style: theme.textTheme.titleLarge),
        const SizedBox(height: AppSpacing.sm),
        ...predictionsAsync.when(
          data: (payload) => payload.models
              .take(6)
              .map(
                (model) => Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.md),
                  child: PanelCard(
                    child: ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text('${model.modelName} · ${model.modelProvider}'),
                      subtitle: Text(
                        model.predictions.isEmpty
                            ? '暂无预测明细'
                            : '推荐：${model.predictions.first.redBalls.join(' ')}'
                                '${model.predictions.first.blueBalls.isEmpty ? '' : ' + ${model.predictions.first.blueBalls.join(' ')}'}',
                        style: theme.textTheme.bodyMedium,
                      ),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => context.go('/prediction/models/${model.modelId}'),
                    ),
                  ),
                ),
              )
              .toList(),
          loading: () => const [],
          error: (error, stack) => const [],
        ),
      ],
    );
  }
}

class _StatBadge extends StatelessWidget {
  const _StatBadge({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.sm),
        decoration: BoxDecoration(
          color: theme.colorScheme.primary.withValues(alpha: 0.1),
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
      ),
    );
  }
}
