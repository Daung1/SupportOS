#!/usr/bin/env python3

import requests
import json
import time
from typing import Dict, List, Tuple

BASE_URL = "http://localhost:3000/analyze"

# ANSI Colors
GREEN = '\033[92m'
BLUE = '\033[94m'
YELLOW = '\033[93m'
RED = '\033[91m'
NC = '\033[0m'

def test_case(name: str, content: str) -> Dict:
    """Make API call and return result"""
    try:
        response = requests.post(
            BASE_URL,
            json={"content": content},
            timeout=10
        )
        response.raise_for_status()
        return response.json()
    except Exception as e:
        return {"error": str(e)}

def print_test(name: str, content: str, result: Dict):
    """Pretty print test result"""
    print(f"{BLUE}{'─' * 70}{NC}")
    print(f"{YELLOW}Test: {name}{NC}")
    print(f"{YELLOW}Input: {content}{NC}")
    print(f"{BLUE}{'─' * 70}{NC}")
    
    if "error" in result:
        print(f"{RED}❌ Error: {result['error']}{NC}")
        return
    
    if not result.get("success"):
        print(f"{RED}❌ Failed{NC}")
        return
    
    data = result.get("data", {})
    output = data.get("output", {})
    
    if isinstance(output, str):
        output = {"error": output}
    
    if not isinstance(output, dict):
        output = {}
    
    print(f"{GREEN}✓ Success{NC}")
    print(f"  Category:       {output.get('category', 'N/A')}")
    print(f"  Priority:       {output.get('priority', 'N/A')}")
    print(f"  Sentiment:      {output.get('sentiment', 'N/A')}")
    print(f"  Keywords:       {', '.join(output.get('keywords', []))}")
    print(f"  Order Number:   {output.get('hasOrderNumber', False)}")
    print(f"  Specific Info:  {output.get('hasSpecificInfo', False)}")
    print(f"  Iterations:     {data.get('iterations', 'N/A')}")
    tokens = data.get('tokensUsed', {})
    print(f"  Tokens:         input={tokens.get('input', 0)}, output={tokens.get('output', 0)}")
    print()

def run_tests():
    """Run all tests"""
    print(f"\n{GREEN}╔{'═' * 68}╗{NC}")
    print(f"{GREEN}║{'ANALYZER AGENT TEST SUITE':^68}║{NC}")
    print(f"{GREEN}╚{'═' * 68}╝{NC}\n")
    
    all_results = []
    
    # Category Tests
    print(f"{GREEN}═══ CATEGORY TESTS ═══{NC}\n")
    
    tests = [
        ("Shipping - Order Delayed", "My order #12345 delayed 5 days"),
        ("Billing - Payment Failed", "My credit card was charged twice for order #67890. Please refund the duplicate charge."),
        ("Account - Login Issue", "I can't log into my account. Getting error message about invalid password."),
        ("Technical - Bug Report", "The app crashes when I try to upload files. This is a critical issue."),
        ("Product - Quality Complaint", "The product arrived damaged. Not what I ordered."),
    ]
    
    for name, content in tests:
        result = test_case(name, content)
        print_test(name, content, result)
        all_results.append((name, result))
    
    # Priority Tests
    print(f"\n{GREEN}═══ PRIORITY TESTS ═══{NC}\n")
    
    tests = [
        ("Priority - Urgent Issue", "URGENT: My entire account is compromised. Someone is accessing it right now!"),
        ("Priority - High Issue", "Important: Payment processing is broken. Customers cannot checkout."),
        ("Priority - Low Issue", "Just wondering if you offer gift cards?"),
    ]
    
    for name, content in tests:
        result = test_case(name, content)
        print_test(name, content, result)
        all_results.append((name, result))
    
    # Sentiment Tests
    print(f"\n{GREEN}═══ SENTIMENT TESTS ═══{NC}\n")
    
    tests = [
        ("Sentiment - Very Positive", "Thank you so much! Your service is amazing. Best experience ever!"),
        ("Sentiment - Very Negative", "Worst company ever! I'm angry about the delayed delivery. Horrible experience."),
        ("Sentiment - Neutral", "What are your business hours?"),
        ("Sentiment - Mixed", "The product quality is great but delivery took forever."),
    ]
    
    for name, content in tests:
        result = test_case(name, content)
        print_test(name, content, result)
        all_results.append((name, result))
    
    # Edge Cases
    print(f"\n{GREEN}═══ EDGE CASES ═══{NC}\n")
    
    tests = [
        ("Edge Case - Very Short", "Help!"),
        ("Edge Case - No Order Number", "When will my package arrive?"),
        ("Edge Case - Multiple Issues", "Order #99999 is late AND I was overcharged. Plus the items are damaged."),
        ("Edge Case - Numbers and Details", "Invoice #INV-2024-001: Charged $500 instead of $50 on 2024-04-19"),
        ("Edge Case - Special Characters", "Why is ticket #ABC-123 still open??? This is unacceptable!!!"),
    ]
    
    for name, content in tests:
        result = test_case(name, content)
        print_test(name, content, result)
        all_results.append((name, result))
    
    # Performance metrics
    print(f"\n{GREEN}═══ PERFORMANCE METRICS ═══{NC}\n")
    
    total_input_tokens = 0
    total_output_tokens = 0
    total_iterations = 0
    test_count = 5
    
    for i in range(test_count):
        result = test_case(f"Performance test {i+1}", f"Test query number {i+1} for performance measurement")
        if result.get("success"):
            data = result.get("data", {})
            tokens = data.get("tokensUsed", {})
            total_input_tokens += tokens.get("input", 0)
            total_output_tokens += tokens.get("output", 0)
            total_iterations += data.get("iterations", 0)
    
    avg_input = total_input_tokens // test_count if test_count > 0 else 0
    avg_output = total_output_tokens // test_count if test_count > 0 else 0
    avg_iterations = total_iterations / test_count if test_count > 0 else 0
    
    print(f"{GREEN}Ran {test_count} consecutive tests:{NC}")
    print(f"  Average Input Tokens:   {avg_input}")
    print(f"  Average Output Tokens:  {avg_output}")
    print(f"  Average Iterations:     {avg_iterations:.1f}")
    print(f"  Total Tokens Used:      {total_input_tokens + total_output_tokens}")
    print()
    
    # Summary Statistics
    print(f"\n{GREEN}═══ SUMMARY STATISTICS ═══{NC}\n")
    
    successful = sum(1 for _, r in all_results if r.get("success"))
    failed = len(all_results) - successful
    
    print(f"{GREEN}✓ Successful tests: {successful}{NC}")
    print(f"{RED}✗ Failed tests: {failed}{NC}")
    print(f"  Total tests: {len(all_results)}")
    
    # Category distribution
    categories = {}
    for name, result in all_results:
        if result.get("success"):
            cat = result.get("data", {}).get("output", {}).get("category", "unknown")
            categories[cat] = categories.get(cat, 0) + 1
    
    print(f"\n{BLUE}Category Distribution:{NC}")
    for cat, count in sorted(categories.items()):
        print(f"  {cat:15} : {count} tests")
    
    print(f"\n{GREEN}╔{'═' * 68}╗{NC}")
    print(f"{GREEN}║{'TEST SUITE COMPLETED':^68}║{NC}")
    print(f"{GREEN}╚{'═' * 68}╝{NC}\n")

if __name__ == "__main__":
    try:
        run_tests()
    except KeyboardInterrupt:
        print(f"\n{YELLOW}Tests interrupted by user{NC}")
    except Exception as e:
        print(f"\n{RED}Error: {e}{NC}")
