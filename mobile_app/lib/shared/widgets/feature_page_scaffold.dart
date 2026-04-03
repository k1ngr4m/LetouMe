import 'package:flutter/material.dart';

import '../../core/constants/app_spacing.dart';

class FeaturePageScaffold extends StatelessWidget {
  const FeaturePageScaffold({
    required this.title,
    required this.children,
    super.key,
    this.actions,
  });

  final String title;
  final List<Widget> children;
  final List<Widget>? actions;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
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
