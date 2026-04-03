import 'package:flutter/material.dart';

import '../../../../core/constants/app_spacing.dart';
import '../../../../shared/widgets/feature_page_scaffold.dart';
import '../../../../shared/widgets/panel_card.dart';

class ModelDetailPage extends StatelessWidget {
  const ModelDetailPage({
    required this.modelCode,
    super.key,
  });

  final String modelCode;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return FeaturePageScaffold(
      title: '模型详情',
      children: [
        PanelCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(modelCode.isEmpty ? '未命名模型' : modelCode, style: theme.textTheme.headlineMedium),
              const SizedBox(height: AppSpacing.sm),
              Text('移动端只保留只读分析、近期表现和推荐理由。', style: theme.textTheme.bodyLarge),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        PanelCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('近期表现', style: theme.textTheme.titleLarge),
              const SizedBox(height: AppSpacing.sm),
              const _MetricRow(label: '近 10 期命中率', value: '73%'),
              const _MetricRow(label: '稳定性评分', value: 'A'),
              const _MetricRow(label: '推荐玩法', value: '胆拖'),
            ],
          ),
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
