"""The approved score formula; absent provider dimensions are a technical failure."""
from decimal import Decimal, ROUND_HALF_UP
import math


def calculate(kind, metrics):
    fields = ['pronunciation'] if kind == 'word' else ['pronunciation','fluency','rhythm','integrity']
    if kind not in ('word','sentence'):
        raise ValueError('Unsupported assessment kind')
    if any(type(metrics.get(k)) not in (int,float) or not math.isfinite(metrics[k]) or not 0 <= metrics[k] <= 100 for k in fields):
        raise ValueError('Missing or invalid scoring dimensions')
    values = {k: Decimal(str(metrics[k])) for k in fields}
    score = values['pronunciation'] if kind == 'word' else (values['pronunciation']*Decimal('.85')+values['fluency']*Decimal('.10')+values['rhythm']*Decimal('.05'))*values['integrity']/100
    return float(score.quantize(Decimal('.1'), rounding=ROUND_HALF_UP))
