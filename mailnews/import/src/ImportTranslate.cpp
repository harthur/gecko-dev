/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 *
 * The contents of this file are subject to the Netscape Public License
 * Version 1.0 (the "NPL"); you may not use this file except in
 * compliance with the NPL.  You may obtain a copy of the NPL at
 * http://www.mozilla.org/NPL/
 *
 * Software distributed under the NPL is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the NPL
 * for the specific language governing rights and limitations under the
 * NPL.
 *
 * The Initial Developer of this code under the NPL is Netscape
 * Communications Corporation.  Portions created by Netscape are
 * Copyright (C) 1998 Netscape Communications Corporation.  All Rights
 * Reserved.
 */

#include "ImportTranslate.h"

int ImportTranslate::m_useTranslator = -1;


PRBool ImportTranslate::ConvertString( const nsCString& inStr, nsCString& outStr, PRBool mimeHeader)
{
	if (inStr.IsEmpty()) {
		outStr = inStr;
		return( PR_TRUE);
	}

	nsImportTranslator *pTrans = GetTranslator();
	int			maxLen = (int) pTrans->GetMaxBufferSize( inStr.Length());
	int			hLen = 0;
	nsCString	set;
	nsCString	lang;

	if (mimeHeader) {
		// add the charset and language
		pTrans->GetCharset( set);
		pTrans->GetLanguage( lang);
	}
	
	// Unfortunatly, we didn't implement ConvertBuffer for all translators,
	// just ConvertToFile.  This means that this data will not always
	// be converted to the charset of pTrans.  In that case...
	// We don't always have the data in the same charset as the current
	// translator...
	// It is safer to leave the charset and language field blank
	set.Truncate();
	lang.Truncate();

	PRUint8 *	pBuf;
	/*
	pBuf = (P_U8) outStr.GetBuffer( maxLen);
	if (!pBuf) {
		delete pTrans;
		return( FALSE);
	}
	pTrans->ConvertBuffer( (PC_U8)(PC_S8)inStr, inStr.GetLength(), pBuf);
	outStr.ReleaseBuffer();
	*/
	outStr = inStr;
	delete pTrans;
	

	// Now I need to run the string through the mime-header special char
	// encoder.

	pTrans = new CMHTranslator;
	pBuf = new PRUint8[pTrans->GetMaxBufferSize( outStr.Length())];
	pTrans->ConvertBuffer( (const PRUint8 *)((const char *)outStr), outStr.Length(), pBuf);
	delete pTrans;
	outStr.Truncate();
	if (mimeHeader) {
		outStr = set;
		outStr += "'";
		outStr += lang;
		outStr += "'";
	}
	outStr += (const char *)pBuf;
	delete [] pBuf;

	return( PR_TRUE);
}


nsImportTranslator *ImportTranslate::GetTranslator( void)
{
	if (m_useTranslator == -1) {
		// get the translator to use...
		// CString		trans;
		// trans.LoadString( IDS_LANGUAGE_TRANSLATION);
		m_useTranslator = 0;
		// if (!trans.CompareNoCase( "iso-2022-jp"))
		//	gWizData.m_useTranslator = 1;
	}

	switch( m_useTranslator) {
	case 0:
		return( new nsImportTranslator);
	//case 1:
	//	return( new CSJis2JisTranslator);
	default:
		return( new nsImportTranslator);
	}
}

nsImportTranslator *ImportTranslate::GetMatchingTranslator( const char *pCharSet)
{
/*
	CString		jp = "iso-2022-jp";
	if (!jp.CompareNoCase( pCharSet))
		return( new CSJis2JisTranslator);
*/

	return( nsnull);
}

