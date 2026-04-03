import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/constants/app_spacing.dart';
import '../../../../shared/widgets/feature_page_scaffold.dart';
import '../../../../shared/widgets/panel_card.dart';
import '../../data/history_repository.dart';

final historyRepositoryProvider = Provider<HistoryRepository>((ref) => HistoryRepository());
final historyRecordsProvider = FutureProvider<List<HistoryRecord>>((ref) => ref.watch(historyRepositoryProvider).fetchHistory());

class HistoryPage extends ConsumerWidget {
  const HistoryPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final recordsAsync = ref.watch(historyRecordsProvider);
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
        ...recordsAsync.when(
          data: (records) => records
              .map(
                (record) => Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.md),
                  child: PanelCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('第 ${record.period} 期', style: theme.textTheme.titleMedium),
                        const SizedBox(height: AppSpacing.xs),
                        Text('开奖：${record.result}', style: theme.textTheme.bodyLarge),
                        const SizedBox(height: AppSpacing.xs),
                        Text(record.summary, style: theme.textTheme.bodyMedium),
                      ],
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
        ),
      ],
    );
  }
}
