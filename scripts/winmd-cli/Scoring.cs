using System;
using System.Linq;

internal static class Scoring
{
	public static int GetMatchScore(string name, string fullName, string query)
	{
		string text = query.Trim();
		if (string.IsNullOrEmpty(text))
		{
			return 0;
		}
		if (name.Equals(text, StringComparison.OrdinalIgnoreCase))
		{
			return 100;
		}
		if (name.StartsWith(text, StringComparison.OrdinalIgnoreCase))
		{
			return 80;
		}
		if (name.Contains(text, StringComparison.OrdinalIgnoreCase) || fullName.Contains(text, StringComparison.OrdinalIgnoreCase))
		{
			return 60;
		}
		string text2 = new string(name.Where(char.IsUpper).ToArray());
		if (text2.Length >= 2 && text2.Contains(text, StringComparison.OrdinalIgnoreCase))
		{
			return 50;
		}
		string[] array = text.Split(' ', StringSplitOptions.RemoveEmptyEntries);
		if (array.Length > 1)
		{
			bool flag = true;
			string[] array2 = array;
			foreach (string value in array2)
			{
				if (!name.Contains(value, StringComparison.OrdinalIgnoreCase) && !fullName.Contains(value, StringComparison.OrdinalIgnoreCase))
				{
					flag = false;
					break;
				}
			}
			if (flag)
			{
				return 40;
			}
		}
		if (IsFuzzySubsequence(name, text))
		{
			return 20;
		}
		return 0;
	}

	private static bool IsFuzzySubsequence(string text, string pattern)
	{
		string text2 = text.ToLowerInvariant();
		string text3 = pattern.ToLowerInvariant();
		int startIndex = 0;
		string text4 = text3;
		foreach (char value in text4)
		{
			int num = text2.IndexOf(value, startIndex);
			if (num < 0)
			{
				return false;
			}
			startIndex = num + 1;
		}
		return true;
	}
}
