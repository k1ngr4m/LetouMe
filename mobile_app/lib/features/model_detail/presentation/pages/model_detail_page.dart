import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/constants/app_spacing.dart';
import '../../../../shared/widgets/feature_page_scaffold.dart';
import '../../../../shared/widgets/panel_card.dart';
import '../../../prediction/data/models/current_predictions_response.dart';
import '../../../prediction/presentation/providers/prediction_overview_provider.dart';

class ModelDetailPage extends ConsumerWidget {
  const ModelDetailPage({
    required this.modelCode,
    super.key,
  });

  final String modelCode;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final predictionsAsync = ref.watch(currentPredictionsProvider);
    return FeaturePageScaffold(
      title: '模型详情',
      children: [
        predictionsAsync.when(
          data: (payload) {
            PredictionModelItem? model;
            for (final item in payload.models) {
              if (item.modelId == modelCode) {
                model = item;
                break;
              }
            }
            if (model == null) {
              return Text('未找到模型 `$modelCode`', style: theme.textTheme.bodyLarge);
            }
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                PanelCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(model.modelName, style: theme.textTheme.headlineMedium),
                      const SizedBox(height: AppSpacing.sm),
                      Text(
                        '${model.modelProvider} · 目标期 ${payload.targetPeriod} · 预测日期 ${payload.predictionDate}',
                        style: theme.textTheme.bodyLarge,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.lg),
                PanelCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('能力摘要', style: theme.textTheme.titleLarge),
                      const SizedBox(height: AppSpacing.sm),
                      _MetricRow(label: '预测组数', value: '${model.predictions.length}'),
                      _MetricRow(label: '最佳命中', value: '${model.bestHitCount ?? 0}'),
                      _MetricRow(
                        label: '按期胜率',
                        value: model.winRateByPeriod == null ? '-' : '${(model.winRateByPeriod * 100).toStringAsFixed(1)}%',
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.lg),
                Text('本期预测', style: theme.textTheme.titleLarge),
                const SizedBox(height: AppSpacing.sm),
                ...model.predictions.map(
                  (group) => Padding(
                    padding: const EdgeInsets.only(bottom: AppSpacing.md),
                    child: PanelCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(group.strategy ?? group.playType ?? '预测组合', style: theme.textTheme.titleMedium),
                          const SizedBox(height: AppSpacing.xs),
                          Text(group.redBalls.join(' '), style: theme.textTheme.bodyLarge),
                          if (group.blueBalls.isNotEmpty) ...[
                            const SizedBox(height: AppSpacing.xs),
                            Text('后区 ${group.blueBalls.join(' ')}', style: theme.textTheme.bodyMedium),
                          ],
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
          error: (error, stack) => Text('模型详情加载失败：$error', style: theme.textTheme.bodyLarge),
        ),
      ],
    );
  }
}

class _MetricRow extends StatelessWidget {
  const _MetricRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Row(
        children: [
          Expanded(child: Text(label)),
          Text(value),
        ],
      ),
    );
  }
}
