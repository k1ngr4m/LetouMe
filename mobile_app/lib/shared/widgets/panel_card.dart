import 'package:flutter/material.dart';

import '../../core/constants/app_spacing.dart';

class PanelCard extends StatelessWidget {
  const PanelCard({
    required this.child,
    super.key,
    this.padding = const EdgeInsets.all(AppSpacing.lg),
  });

  final Widget child;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: padding,
        child: child,
      ),
    );
  }
}
