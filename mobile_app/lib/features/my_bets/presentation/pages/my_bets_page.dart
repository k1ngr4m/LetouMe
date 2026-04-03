import 'package:flutter/material.dart';

import '../../../../core/constants/app_spacing.dart';
import '../../../../shared/widgets/feature_page_scaffold.dart';
import '../../../../shared/widgets/panel_card.dart';

class MyBetsPage extends StatelessWidget {
  const MyBetsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return FeaturePageScaffold(
      title: '我的投注',
      actions: [
        IconButton(
          onPressed: () {},
          icon: const Icon(Icons.add),
        ),
      ],
      children: [
        PanelCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('最近投注', style: theme.textTheme.titleLarge),
              const SizedBox(height: AppSpacing.sm),
              Text('首期建议聚焦录入、查看、简单命中回顾。', style: theme.textTheme.bodyMedium),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        ...List.generate(
          4,
          (index) => Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.md),
            child: PanelCard(
              child: ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text('大乐透自选单 #${index + 1}'),
                subtitle: const Text('03 08 12 16 29 + 06 10'),
                trailing: Text(index.isEven ? '待开奖' : '已结算'),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
