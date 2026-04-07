import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/constants/app_spacing.dart';
import '../../../../shared/widgets/feature_page_scaffold.dart';
import '../../../../shared/widgets/panel_card.dart';
import '../../data/models/my_bet_record.dart';
import '../providers/my_bets_provider.dart';

class MyBetDetailPage extends ConsumerStatefulWidget {
  const MyBetDetailPage({
    required this.recordId,
    super.key,
  });

  final int recordId;

  @override
  ConsumerState<MyBetDetailPage> createState() => _MyBetDetailPageState();
}

class _MyBetDetailPageState extends ConsumerState<MyBetDetailPage> {
  bool _isEditing = false;
  bool _isSubmitting = false;
  String? _submitError;
  late final TextEditingController _targetPeriodController;
  late final TextEditingController _discountController;
  List<_EditableDltLine> _lines = const [];

  @override
  void initState() {
    super.initState();
    _targetPeriodController = TextEditingController();
    _discountController = TextEditingController();
  }

  @override
  void dispose() {
    _targetPeriodController.dispose();
    _discountController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final detailAsync = ref.watch(myBetDetailProvider(widget.recordId));
    return FeaturePageScaffold(
      title: '投注详情',
      actions: [
        detailAsync.maybeWhen(
          data: (record) {
            final editable = _canEditRecord(record);
            return IconButton(
              onPressed: editable
                  ? () {
                      if (!_isEditing) {
                        _hydrateForm(record);
                      }
                      setState(() {
                        _submitError = null;
                        _isEditing = !_isEditing;
                      });
                    }
                  : null,
              icon: Icon(_isEditing ? Icons.close : Icons.edit_outlined),
            );
          },
          orElse: () => const SizedBox.shrink(),
        ),
      ],
      children: [
        detailAsync.when(
          data: (record) {
            final canEdit = _canEditRecord(record);
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                PanelCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('第 ${record.targetPeriod} 期', style: theme.textTheme.headlineMedium),
                      const SizedBox(height: AppSpacing.sm),
                      Text(
                        '${record.playType} · ${record.settlementStatus == 'settled' ? '已结算' : '待开奖'} · 实付 ${record.netAmount} 元',
                        style: theme.textTheme.bodyLarge,
                      ),
                      if (!canEdit) ...[
                        const SizedBox(height: AppSpacing.sm),
                        Text('当前仅支持编辑大乐透普通投注，其他玩法先保持只读。', style: theme.textTheme.bodyMedium),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.lg),
                if (_isEditing) ...[
                  _EditSection(
                    targetPeriodController: _targetPeriodController,
                    discountController: _discountController,
                    lines: _lines,
                    onAddLine: _addLine,
                    onRemoveLine: _removeLine,
                    onLineChanged: _updateLine,
                    onSubmit: canEdit ? () => _submit(record) : null,
                    isSubmitting: _isSubmitting,
                    submitError: _submitError,
                  ),
                ] else ...[
                  if (record.actualResult != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: AppSpacing.lg),
                      child: PanelCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('开奖结果', style: theme.textTheme.titleLarge),
                            const SizedBox(height: AppSpacing.sm),
                            Text(
                              '${(record.actualResult?['red_balls'] as List<dynamic>? ?? const []).join(' ')}'
                              '${(record.actualResult?['blue_balls'] as List<dynamic>? ?? const []).isEmpty ? '' : ' + ${(record.actualResult?['blue_balls'] as List<dynamic>? ?? const []).join(' ')}'}',
                              style: theme.textTheme.bodyLarge,
                            ),
                          ],
                        ),
                      ),
                    ),
                  PanelCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('投注子单', style: theme.textTheme.titleLarge),
                        const SizedBox(height: AppSpacing.sm),
                        ...record.lines.map(
                          (line) => Padding(
                            padding: const EdgeInsets.only(bottom: AppSpacing.md),
                            child: Container(
                              padding: const EdgeInsets.all(AppSpacing.md),
                              decoration: BoxDecoration(
                                color: theme.colorScheme.primary.withValues(alpha: 0.06),
                                borderRadius: BorderRadius.circular(18),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('第 ${line.lineNo} 注 · ${line.playType}', style: theme.textTheme.titleMedium),
                                  const SizedBox(height: AppSpacing.xs),
                                  Text(
                                    '${line.frontNumbers.join(' ')}${line.backNumbers.isEmpty ? '' : ' + ${line.backNumbers.join(' ')}'}',
                                    style: theme.textTheme.bodyLarge,
                                  ),
                                  const SizedBox(height: AppSpacing.xs),
                                  Text('倍投 ${line.multiplier} · 金额 ${line.amount} 元', style: theme.textTheme.bodyMedium),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            );
          },
          loading: () => const Padding(
            padding: EdgeInsets.only(top: AppSpacing.xl),
            child: Center(child: CircularProgressIndicator()),
          ),
          error: (error, stack) => Text('投注详情加载失败：$error', style: theme.textTheme.bodyLarge),
        ),
      ],
    );
  }

  bool _canEditRecord(MyBetRecord record) {
    return record.lotteryCode == 'dlt' && record.lines.every((line) => line.playType == 'dlt');
  }

  void _hydrateForm(MyBetRecord record) {
    _targetPeriodController.text = record.targetPeriod;
    _discountController.text = '${record.discountAmount}';
    _lines = record.lines
        .map(
          (line) => _EditableDltLine(
            frontNumbers: line.frontNumbers.join(' '),
            backNumbers: line.backNumbers.join(' '),
            multiplier: line.multiplier,
            isAppend: line.isAppend,
          ),
        )
        .toList();
    if (_lines.isEmpty) {
      _lines = [const _EditableDltLine()];
    }
  }

  void _addLine() {
    setState(() {
      _lines = [..._lines, const _EditableDltLine()];
    });
  }

  void _removeLine(int index) {
    if (_lines.length <= 1) return;
    setState(() {
      _lines = [..._lines]..removeAt(index);
    });
  }

  void _updateLine(int index, _EditableDltLine nextLine) {
    final updated = [..._lines];
    updated[index] = nextLine;
    setState(() {
      _lines = updated;
    });
  }

  Future<void> _submit(MyBetRecord original) async {
    setState(() {
      _isSubmitting = true;
      _submitError = null;
    });
    try {
      final payload = UpdateMyBetPayload(
        recordId: original.id,
        lotteryCode: original.lotteryCode,
        targetPeriod: _targetPeriodController.text.trim(),
        discountAmount: int.tryParse(_discountController.text.trim()) ?? 0,
        sourceType: original.sourceType,
        ticketImageUrl: original.ticketImageUrl,
        ocrText: original.ocrText,
        ocrProvider: original.ocrProvider,
        ocrRecognizedAt: original.ocrRecognizedAt,
        ticketPurchasedAt: original.ticketPurchasedAt,
        lines: _lines
            .map(
              (line) => UpdateMyBetLinePayload(
                playType: 'dlt',
                frontNumbers: _splitNumbers(line.frontNumbers),
                backNumbers: _splitNumbers(line.backNumbers),
                multiplier: line.multiplier < 1 ? 1 : line.multiplier,
                isAppend: line.isAppend,
              ),
            )
            .toList(),
      );
      await ref.read(myBetsRepositoryProvider).updateRecord(payload);
      ref.invalidate(myBetsListProvider);
      ref.invalidate(myBetDetailProvider(widget.recordId));
      setState(() {
        _isEditing = false;
      });
    } catch (error) {
      setState(() {
        _submitError = error.toString();
      });
    } finally {
      if (mounted) {
        setState(() {
          _isSubmitting = false;
        });
      }
    }
  }

  List<String> _splitNumbers(String raw) {
    return raw
        .split(RegExp(r'[\s,，、;；|/]+'))
        .map((item) => item.trim())
        .where((item) => item.isNotEmpty)
        .map((item) => item.padLeft(2, '0'))
        .toSet()
        .toList()
      ..sort();
  }
}

class _EditSection extends StatelessWidget {
  const _EditSection({
    required this.targetPeriodController,
    required this.discountController,
    required this.lines,
    required this.onAddLine,
    required this.onRemoveLine,
    required this.onLineChanged,
    required this.onSubmit,
    required this.isSubmitting,
    required this.submitError,
  });

  final TextEditingController targetPeriodController;
  final TextEditingController discountController;
  final List<_EditableDltLine> lines;
  final VoidCallback onAddLine;
  final void Function(int index) onRemoveLine;
  final void Function(int index, _EditableDltLine line) onLineChanged;
  final VoidCallback? onSubmit;
  final bool isSubmitting;
  final String? submitError;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        PanelCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TextField(
                controller: targetPeriodController,
                decoration: const InputDecoration(labelText: '期号'),
                keyboardType: TextInputType.number,
              ),
              const SizedBox(height: AppSpacing.md),
              TextField(
                controller: discountController,
                decoration: const InputDecoration(labelText: '优惠金额'),
                keyboardType: TextInputType.number,
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        ...lines.asMap().entries.map(
              (entry) => Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.md),
                child: _LineEditor(
                  index: entry.key,
                  line: entry.value,
                  onChanged: (line) => onLineChanged(entry.key, line),
                  onRemove: lines.length > 1 ? () => onRemoveLine(entry.key) : null,
                ),
              ),
            ),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: onAddLine,
            icon: const Icon(Icons.add),
            label: const Text('新增一注'),
          ),
        ),
        if (submitError != null) ...[
          const SizedBox(height: AppSpacing.sm),
          Text(submitError!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
        ],
        const SizedBox(height: AppSpacing.md),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: isSubmitting ? null : onSubmit,
            child: Text(isSubmitting ? '保存中...' : '保存修改'),
          ),
        ),
      ],
    );
  }
}

class _LineEditor extends StatelessWidget {
  const _LineEditor({
    required this.index,
    required this.line,
    required this.onChanged,
    this.onRemove,
  });

  final int index;
  final _EditableDltLine line;
  final ValueChanged<_EditableDltLine> onChanged;
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context) {
    return PanelCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text('第 ${index + 1} 注', style: Theme.of(context).textTheme.titleMedium)),
              if (onRemove != null)
                IconButton(
                  onPressed: onRemove,
                  icon: const Icon(Icons.delete_outline),
                ),
            ],
          ),
          TextFormField(
            key: ValueKey('front-$index-${line.frontNumbers}'),
            initialValue: line.frontNumbers,
            onChanged: (value) => onChanged(line.copyWith(frontNumbers: value)),
            decoration: const InputDecoration(labelText: '前区号码，空格分隔'),
          ),
          const SizedBox(height: AppSpacing.md),
          TextFormField(
            key: ValueKey('back-$index-${line.backNumbers}'),
            initialValue: line.backNumbers,
            onChanged: (value) => onChanged(line.copyWith(backNumbers: value)),
            decoration: const InputDecoration(labelText: '后区号码，空格分隔'),
          ),
          const SizedBox(height: AppSpacing.md),
          Row(
            children: [
              Expanded(
                child: TextFormField(
                  key: ValueKey('multiplier-$index-${line.multiplier}'),
                  initialValue: '${line.multiplier}',
                  keyboardType: TextInputType.number,
                  onChanged: (value) => onChanged(line.copyWith(multiplier: int.tryParse(value) ?? 1)),
                  decoration: const InputDecoration(labelText: '倍投'),
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: SwitchListTile(
                  value: line.isAppend,
                  onChanged: (value) => onChanged(line.copyWith(isAppend: value)),
                  title: const Text('追加'),
                  contentPadding: EdgeInsets.zero,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _EditableDltLine {
  const _EditableDltLine({
    this.frontNumbers = '',
    this.backNumbers = '',
    this.multiplier = 1,
    this.isAppend = false,
  });

  final String frontNumbers;
  final String backNumbers;
  final int multiplier;
  final bool isAppend;

  _EditableDltLine copyWith({
    String? frontNumbers,
    String? backNumbers,
    int? multiplier,
    bool? isAppend,
  }) {
    return _EditableDltLine(
      frontNumbers: frontNumbers ?? this.frontNumbers,
      backNumbers: backNumbers ?? this.backNumbers,
      multiplier: multiplier ?? this.multiplier,
      isAppend: isAppend ?? this.isAppend,
    );
  }
}
