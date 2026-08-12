#!/bin/bash

# Batch PDF extraction for multiple IPOs
# Usage: bash batch_extract.sh

set -e

API_BASE="${API_BASE:-http://localhost:3000}"
ADMIN_TOKEN="${ADMIN_TOKEN:-dev-token-123}"

# Configure your IPOs here (IPO_ID:RHP_URL pairs)
# Get URLs from ipowatch.in, sahi.com, or company IR pages
declare -a IPOS=(
    # Format: "IPO_ID:RHP_URL"
    # "technocraft-id:https://example.com/technocraft-rhp.pdf"
    # "leap-id:https://example.com/leap-rhp.pdf"
)

echo "🚀 Batch PDF Extraction"
echo "========================"
echo "API: $API_BASE"
echo "Found ${#IPOS[@]} IPOs to process\n"

if [ ${#IPOS[@]} -eq 0 ]; then
    echo "❌ No IPOs configured. Edit batch_extract.sh and add RHP URLs."
    echo "\nExample:"
    echo '  IPOS=('
    echo '    "technocraft-id:https://nsearchives.nseindia.com/..."'
    echo '    "leap-id:https://..."'
    echo '  )'
    exit 1
fi

# Create venv if needed
if [ ! -d "venv" ]; then
    echo "📦 Creating Python environment..."
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
else
    source venv/bin/activate
fi

# Process each IPO
TOTAL=${#IPOS[@]}
COMPLETED=0
FAILED=0

for ipo in "${IPOS[@]}"; do
    IFS=':' read -r ipo_id rhp_url <<< "$ipo"

    echo "\n📄 Processing: $ipo_id"
    echo "   URL: $rhp_url"

    if python extract.py "$rhp_url" "$ipo_id" RHP "$API_BASE" "$ADMIN_TOKEN"; then
        ((COMPLETED++))
        echo "   ✅ Success"
    else
        ((FAILED++))
        echo "   ❌ Failed"
    fi
done

echo "\n\n📊 Summary"
echo "=========="
echo "Total:     $TOTAL"
echo "Completed: $COMPLETED"
echo "Failed:    $FAILED"

if [ $FAILED -eq 0 ]; then
    echo "\n✅ All IPOs processed successfully!"
    echo "Next: Review at http://localhost:3000/admin/financials"
else
    echo "\n⚠️  Some extractions failed. Check logs above."
fi
