import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/constants/app_spacing.dart';
import '../../../../shared/widgets/feature_page_scaffold.dart';
import '../../../../shared/widgets/panel_card.dart';
import '../../../prediction/presentation/providers/prediction_overview_provider.dart';
import '../../data/history_repository.dart';
import '../../data/models/predictions_history_detail_response.dart';
import 'history_page.dart';

final historyDetailProvider = FutureProvider.family<PredictionsHistoryDetailResponse, String>((ref, targetPeriod) {
  final lotteryCode = ref.watch(selectedLotteryCodeProvider);
  return ref.watch(historyRepositoryProvider).fetchHistoryDetail(targetPeriod: targetPeriod, lotteryCode: lotteryCode);
});

class HistoryDetailPage extends ConsumerWidget {
  const HistoryDetailPage({
    required this.targetPeriod,
    super.key,
  });

  final String targetPeriod;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final detailAsync = ref.watch(historyDetailProvider(targetPeriod));
    return FeaturePageScaffold(
      title: '历史详情',
      children: [
        detailAsync.when(
          data: (response) {
            final record = response.records.isNotEmpty ? response.records.first : null;
            if (record == null) {
              return Text('未找到 $targetPeriod 的历史详情', style: theme.textTheme.bodyLarge);
            }
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                PanelCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('目标期 ${record.targetPeriod}', style: theme.textTheme.headlineMedium),
                      const SizedBox(height: AppSpacing.sm),
                      Text('预测日期 ${record.predictionDate}', style: theme.textTheme.bodyMedium),
                      const SizedBox(height: AppSpacing.md),
                      Text(
                        record.actualResult == null
                            ? '尚未开奖'
                            : '开奖结果：${record.actualResult!.redBalls.join(' ')}'
                                '${record.actualResult!.blueBalls.isEmpty ? '' : ' + ${record.actualResult!.blueBalls.join(' ')}'}',
                        style: theme.textTheme.bodyLarge,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.lg),
                if (response.modelStats.isNotEmpty) ...[
                  Text('模型统计', style: theme.textTheme.titleLarge),
                  const SizedBox(height: AppSpacing.sm),
                  ...response.modelStats.take(5).map(
                        (stat) => Padding(
                          padding: const EdgeInsets.only(bottom: AppSpacing.md),
                          child: PanelCard(
                            child: Row(
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(stat.modelName, style: theme.textTheme.titleMedium),
                                      const SizedBox(height: AppSpacing.xs),
                                      Text('命中期数 ${stat.winningPeriods}/${stat.periods}', style: theme.textTheme.bodyMedium),
                                    ],
                                  ),
                                ),
                                Text('${(stat.winRateByPeriod * 100).toStringAsFixed(1)}%', style: theme.textTheme.titleMedium),
                              ],
                            ),
                          ),
                        ),
                      ),
                  const SizedBox(height: AppSpacing.lg),
                ],
                Text('本期预测组合', style: theme.textTheme.titleLarge),
                const SizedBox(height: AppSpacing.sm),
                ...record.models.map(
                  (model) => Padding(
                    padding: const EdgeInsets.only(bottom: AppSpacing.md),
                    child: PanelCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(model.modelName, style: theme.textTheme.titleMedium),
                          const SizedBox(height: AppSpacing.xs),
                          Text('${model.modelProvider} · 最佳命中 ${model.bestHitCount ?? 0}', style: theme.textTheme.bodyMedium),
                          const SizedBox(height: AppSpacing.sm),
                          ...model.predictions.take(3).map(
                                (group) => Padding(
                                  padding: const EdgeInsets.only(bottom: AppSpacing.xs),
                                  child: Text(
                                    '${group.strategy ?? group.playType ?? '预测'}：${group.redBalls.join(' ')}'
                                    '${group.blueBalls.isEmpty ? '' : ' + ${group.blueBalls.join(' ')}'}',
                                    style: theme.textTheme.bodyLarge,
                                  ),
                                ),
                              ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            );
          },
          loading: () => const Padding(
            padding: EdgeInsets.only(top: AppSpacing.xl),
            child: Center(child: CircularProgressIndicator()),
          ),
          error: (error, stack) => Text('历史详情加载失败：$error', style: theme.textTheme.bodyLarge),
        ),
      ],
    );
  }
}
