using System;
using System.Linq;
using System.Collections.Generic;

class Itertools {
	static public IEnumerable<IEnumerable<T>> Product<T>(
		IEnumerable<IEnumerable<T>> sets) {
		List<List<T>> addList(List<List<T>> prod, List<T> next) {
			var newProd = new List<List<T>> {};

			foreach(var s in prod) {
				foreach(var v in next) {
					newProd.Add(s.Append(v).ToList());
				}
			}

			return newProd;
		}

		var ret = new List<List<T>> { new List<T> {} };

		foreach(var s in sets) {
			ret = addList(ret, s.ToList());
		}

		return ret;
	}

	static public IEnumerable<IEnumerable<T>> RepeatProduct<T>(
		IEnumerable<T> vals, int repeats) {
		IEnumerable<IEnumerable<T>> iterFn() {
			for(var i = 0; i < repeats; i++) {
				yield return vals;
			}
		};

		return Product<T>(iterFn());
	}
}