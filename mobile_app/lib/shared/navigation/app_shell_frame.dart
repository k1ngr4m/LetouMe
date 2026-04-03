import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class AppShellFrame extends StatelessWidget {
  const AppShellFrame({required this.navigationShell, super.key});

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: navigationShell,
      bottomNavigationBar: NavigationBar(
        selectedIndex: navigationShell.currentIndex,
        onDestinationSelected: (index) => navigationShell.goBranch(index),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.auto_awesome), label: '预测'),
          NavigationDestination(icon: Icon(Icons.history), label: '历史'),
          NavigationDestination(icon: Icon(Icons.confirmation_number_outlined), label: '投注'),
          NavigationDestination(icon: Icon(Icons.mail_outline), label: '消息'),
          NavigationDestination(icon: Icon(Icons.person_outline), label: '我的'),
        ],
      ),
    );
  }
}
