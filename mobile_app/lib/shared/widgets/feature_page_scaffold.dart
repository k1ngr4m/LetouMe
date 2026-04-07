import 'package:flutter/material.dart';

import '../../core/constants/app_spacing.dart';

class FeaturePageScaffold extends StatelessWidget {
  const FeaturePageScaffold({
    required this.title,
    required this.children,
    super.key,
    this.actions,
    this.leading,
  });

  final String title;
  final List<Widget> children;
  final List<Widget>? actions;
  final Widget? leading;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: leading,
        title: Text(title),
        actions: actions,
      ),
      body: SafeArea(
        child: ListView(
          padding: AppSpacing.screen,
          children: children,
        ),
      ),
    );
  }
}
