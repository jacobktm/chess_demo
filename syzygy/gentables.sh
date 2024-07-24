#!/bin/bash

# Define the initial pawn tables to generate
pawn_tables=("KPvK" "KPvKP" "KPPvK" "KPPvKP" "KPPvKPP")

# Function to verify the table
verify_table() {
  local table=$1
  local verify_cmd
  if [[ $table == *P* ]]; then
    verify_cmd="rtbverp $table"
  else
    verify_cmd="rtbver $table"
  fi
  echo "Verifying: $verify_cmd"
  result=$(eval $verify_cmd 2>&1)
  if [[ $result == *"No errors."* ]]; then
    echo "No errors found for $table, skipping generation."
    return 0
  else
    return 1
  fi
}

# Function to check if the table files exist and verify them
check_and_verify() {
  local table=$1
  if [[ -f "$table.rtbw" && -f "$table.rtbx" ]]; then
    if verify_table $table; then
      return 0
    else
      return 1
    fi
  else
    return 1
  fi
}

# Function to generate a table and check for missing tables
generate_table() {
  local table=$1
  local cmd
  local missing

  if check_and_verify $table; then
    return
  fi

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