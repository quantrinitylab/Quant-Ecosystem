# Data Lakehouse Architecture

Layers:
1. raw evidence
2. validated events
3. conformed domain data
4. curated analytical datasets
5. governed marts/features

Raw and derived layers have independent lifecycle rules.

Derived datasets must retain lineage to source events and respect source deletion, residency, and privacy constraints.
