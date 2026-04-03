import 'package:flutter/material.dart';

import '../../../../core/constants/app_spacing.dart';
import '../../../../shared/widgets/feature_page_scaffold.dart';
import '../../../../shared/widgets/panel_card.dart';

class RulesPage extends StatelessWidget {
  const RulesPage({super.key});

  @override
  Widget build(BuildContext context) {
    return const FeaturePageScaffold(
      title: '规则说明',
      children: [
        PanelCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('大乐透玩法'),
              SizedBox(height: AppSpacing.sm),
              Text('前区选择 5 个号码，后区选择 2 个号码。移动端适合呈现规则、FAQ 与说明卡片。'),
            ],
          ),
        ),
        SizedBox(height: AppSpacing.lg),
        PanelCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('预测说明'),
              SizedBox(height: AppSpacing.sm),
              Text('移动端以“展示预测与历史效果”为核心，不承诺收益，不提供后台管理能力。'),
            ],
          ),
        ),
      ],
    );
  }
}
