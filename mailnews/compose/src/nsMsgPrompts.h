/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 *
 * The contents of this file are subject to the Netscape Public
 * License Version 1.1 (the "License"); you may not use this file
 * except in compliance with the License. You may obtain a copy of
 * the License at http://www.mozilla.org/NPL/
 *
 * Software distributed under the License is distributed on an "AS
 * IS" basis, WITHOUT WARRANTY OF ANY KIND, either express or
 * implied. See the License for the specific language governing
 * rights and limitations under the License.
 *
 * The Original Code is mozilla.org code.
 *
 * The Initial Developer of the Original Code is Netscape
 * Communications Corporation.  Portions created by Netscape are
 * Copyright (C) 1998 Netscape Communications Corporation. All
 * Rights Reserved.
 *
 * Contributor(s): 
 */

#ifndef _nsMsgPrompts_H_
#define _nsMsgPrompts_H_

#include "nscore.h"
#include "nsError.h"
#include "nsString.h"

class nsIPrompt;

nsresult      nsMsgBuildErrorMessageByID(PRInt32 msgID, nsString& retval, nsString* param0 = nsnull, nsString* param1 = nsnull);
nsresult      nsMsgDisplayMessageByID(nsIPrompt * aPrompt, PRInt32 msgID, const PRUnichar * windowTitle = nsnull);
nsresult      nsMsgDisplayMessageByString(nsIPrompt * aPrompt, const PRUnichar * msg, const PRUnichar * windowTitle = nsnull);
nsresult      nsMsgAskBooleanQuestionByID(nsIPrompt * aPrompt, PRInt32 msgID, PRBool *answer, const PRUnichar * windowTitle = nsnull);
nsresult      nsMsgAskBooleanQuestionByString(nsIPrompt * aPrompt, const PRUnichar * msg, PRBool *answer, const PRUnichar * windowTitle = nsnull);

#endif /* _nsMsgPrompts_H_ */
