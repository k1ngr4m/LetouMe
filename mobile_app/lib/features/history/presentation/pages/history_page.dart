import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router.dart';
import '../../../../core/constants/app_spacing.dart';
import '../../../../core/network/api_client_provider.dart';
import '../../../../shared/widgets/feature_page_scaffold.dart';
import '../../../../shared/widgets/panel_card.dart';
import '../../../prediction/presentation/providers/prediction_overview_provider.dart';
import '../../data/models/predictions_history_response.dart';
import '../../data/history_repository.dart';

final historyRepositoryProvider = Provider<HistoryRepository>((ref) => HistoryRepository(apiClient: ref.watch(apiClientProvider)));
final historyRecordsProvider = FutureProvider<PredictionsHistoryListResponse>((ref) {
  final lotteryCode = ref.watch(selectedLotteryCodeProvider);
  return ref.watch(historyRepositoryProvider).fetchHistory(lotteryCode: lotteryCode);
});

class HistoryPage extends ConsumerWidget {
  const HistoryPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final recordsAsync = ref.watch(historyRecordsProvider);
    final content = recordsAsync.when<List<Widget>>(
      data: (response) => response.records
          .map(
            (record) => Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.md),
              child: PanelCard(
                child: InkWell(
                  borderRadius: BorderRadius.circular(24),
                  onTap: () => context.push('${AppRoute.history.path}/${record.targetPeriod}'),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('第 ${record.targetPeriod} 期', style: theme.textTheme.titleMedium),
                      const SizedBox(height: AppSpacing.xs),
                      Text(
                        record.actualResult == null
                            ? '尚未开奖'
                            : '开奖：${record.actualResult!.redBalls.join(' ')}'
                                '${record.actualResult!.blueBalls.isEmpty ? '' : ' + ${record.actualResult!.blueBalls.join(' ')}'}',
                        style: theme.textTheme.bodyLarge,
                      ),
                      const SizedBox(height: AppSpacing.xs),
                      Text(
                        record.models.isEmpty
                            ? '暂无模型摘要'
                            : '${record.models.first.modelName} · 命中 ${record.models.first.bestHitCount ?? 0} · 胜率 ${(record.models.first.winRateByPeriod ?? 0).toStringAsFixed(2)}',
                        style: theme.textTheme.bodyMedium,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          )
          .toList(),
      loading: () => const [
        Padding(
          padding: EdgeInsets.only(top: AppSpacing.lg),
          child: Center(child: CircularProgressIndicator()),
        ),
      ],
      error: (error, stack) => [
        Padding(
          padding: const EdgeInsets.only(top: AppSpacing.lg),
          child: Text('历史数据加载失败：$error', style: theme.textTheme.bodyMedium),
        ),
      ],
    );
    return FeaturePageScaffold(
      title: '历史记录',
      children: [
        PanelCard(
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  decoration: const InputDecoration(
                    prefixIcon: Icon(Icons.search),
                    labelText: '搜索期号、玩法或模型',
                  ),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              FilledButton.tonal(
                onPressed: () {},
                child: const Text('筛选'),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        ...content,
      ],
    );
  }
}
