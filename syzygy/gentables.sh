#!/bin/bash

# Define the initial pawn tables to generate
pawn_tables=("KBvK" "KNvK" "KPvK" "KPvKP" "KPPvK" "KPPvKP" "KPPvKPP" "KPPPvK" "KPPPvKP" "KPPPvKPP" "KPPPvKPPP")

# Function to generate a table and check for missing tables
generate_table() {
  local table=$1
  local cmd
  local missing

  if [[ $table == *P* ]]; then
    cmd="rtbgenp --threads $(nproc) $table"
  else
    cmd="rtbgen --threads $(nproc) $table"
  fi

  echo "Running: $cmd"
  missing=$(eval $cmd 2>&1 | grep "Missing table")

  while [[ -n "$missing" ]]; do
    echo "$missing" | while read -r line ; do
      new_table=$(echo $line | awk '{print $4}')
      generate_table $new_table
    done
    echo "Retrying: $cmd"
    missing=$(eval $cmd 2>&1 | grep "Missing table")
  done
}

# Start the process by generating the initial pawn tables
for table in "${pawn_tables[@]}"; do
  generate_table $table
done

echo "All commands executed."

