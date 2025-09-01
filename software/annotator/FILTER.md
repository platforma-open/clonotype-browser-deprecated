# Фильтры аннотатора клонотипов

Подробное описание работы всех типов фильтров в системе аннотации клонотипов.

## Архитектура фильтров

Все фильтры наследуются от базового класса `Base` и имеют единый интерфейс:
- `to_polars_expr()` - преобразует фильтр в выражение Polars
- `get_required_source_columns()` - возвращает набор исходных колонок, необходимых для работы
- `get_required_transformed_columns()` - возвращает набор трансформированных колонок

## Типы фильтров

### 1. PatternFilter - Фильтр по образцу

Работает со строковыми данными, поддерживает два типа предикатов:

#### PatternPredicateEquals
```python
{
    "type": "pattern",
    "column": "cdr3_seq", 
    "predicate": {
        "type": "equals",
        "value": "CASSLEETQYF"
    }
}
```
- **Логика**: `column == value`
- **Обработка NULL**: NULL значения автоматически исключаются (`& col_expr.is_not_null()`)

#### PatternPredicateContainSubsequence
```python
{
    "type": "pattern",
    "column": "v_gene",
    "predicate": {
        "type": "containSubsequence", 
        "value": "TRBV"
    }
}
```
- **Логика**: `column.str.contains(value, literal=True)` 
- **Особенности**: Поиск точной подстроки (не regex)

### 2. NumericalComparisonFilter - Численное сравнение

Самый сложный фильтр, поддерживающий сравнение между колонками и литералами.

```python
{
    "type": "numericalComparison",
    "lhs": "frequency",           # левая часть (может быть колонка или число)
    "rhs": {"column": "threshold"}, # правая часть 
    "minDiff": 0.1,              # минимальная разность
    "allowEqual": false          # разрешить равенство
}
```

#### Логика работы:
- **Базовая формула**: `rhs > lhs + minDiff` (если `allowEqual=false`)
- **С равенством**: `rhs >= lhs + minDiff` (если `allowEqual=true`)
- **Обработка NULL**: Любые NULL в арифметике дают NULL, который заменяется на False

#### Примеры:
```python
# Простое сравнение: frequency > 0.05
{
    "lhs": "frequency",
    "rhs": 0.05,
    "minDiff": 0,
    "allowEqual": false
}

# Сравнение колонок с минимальной разностью
{
    "lhs": "count_sample1", 
    "rhs": "count_sample2",
    "minDiff": 10,
    "allowEqual": true
}
# Означает: count_sample2 >= count_sample1 + 10
```

### 3. IsNA - Проверка на отсутствие данных

```python
{
    "type": "isNA",
    "column": "annotation"
}
```
- **Логика**: `column.is_null()`
- **Использование**: Поиск строк с пропущенными значениями

### 4. Логические фильтры

#### OrFilter - Логическое ИЛИ
```python
{
    "type": "or",
    "filters": [
        {"type": "pattern", "column": "chain", "predicate": {"type": "equals", "value": "TRA"}},
        {"type": "pattern", "column": "chain", "predicate": {"type": "equals", "value": "TRB"}}
    ]
}
```
- **Логика**: `filter1 | filter2 | ... | filterN`
- **Пустой список**: возвращает `False`

#### AndFilter - Логическое И
```python
{
    "type": "and", 
    "filters": [
        {"type": "numericalComparison", "lhs": "frequency", "rhs": 0.01, "minDiff": 0},
        {"type": "pattern", "column": "productive", "predicate": {"type": "equals", "value": "True"}}
    ]
}
```
- **Логика**: `filter1 & filter2 & ... & filterN`
- **Пустой список**: возвращает `True`

#### NotFilter - Логическое НЕ
```python
{
    "type": "not",
    "filter": {
        "type": "isNA", 
        "column": "cdr3_seq"
    }
}
```
- **Логика**: `~inner_filter`
- **Обработка NULL**: Предполагается, что внутренний фильтр обрабатывает NULL → False

## Работа с трансформированными колонками

Фильтры могут работать с трансформированными колонками вместо исходных:

```python
{
    "type": "numericalComparison",
    "lhs": {
        "transformer": "rank",
        "column": "frequency", 
        "descending": true
    },
    "rhs": 10,
    "minDiff": 0,
    "allowEqual": true  
}
# Означает: ранг частоты (по убыванию) <= 10
```

## Обработка NULL значений

Критически важный аспект работы фильтров:

1. **PatternFilter**: Явно исключает NULL (`& col.is_not_null()`)
2. **NumericalComparisonFilter**: NULL в арифметике → NULL → `fill_null(False)`
3. **IsNA**: Специально ищет NULL значения
4. **Логические фильтры**: Polars корректно обрабатывает NULL в `|`, `&`, `~`

## Применение фильтров в скрипте

Фильтры применяются последовательно в порядке, указанном в массиве `steps`:

```python
{
    "mode": "bySampleAndClonotype",
    "steps": [
        {
            "filter": {...},
            "label": "high_frequency"
        },
        {
            "filter": {...}, 
            "label": "medium_frequency"
        }
    ]
}
```

**Логика применения**:
- Начинается с `label = NULL` для всех строк
- Для каждого шага: если фильтр проходит И текущая метка NULL → присваивается новая метка
- Строки с уже присвоенными метками не перезаписываются
- В итоговый результат попадают только строки с `label IS NOT NULL`

## Режимы группировки

Трансформации колонок зависят от режима:
- **byClonotype**: Трансформации применяются глобально
- **bySampleAndClonotype**: Трансформации группируются по `sampleKeyColumn`

Например, ранжирование частоты в режиме `bySampleAndClonotype` будет выполняться отдельно для каждого образца.